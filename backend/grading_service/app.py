import os
from boxdetect import config
from boxdetect.pipelines import get_boxes
import cv2
import numpy as np
import argparse
import json

# Quiet mode: suppress all terminal output
QUIET_MODE = True
if QUIET_MODE:
    import builtins
    builtins.print = lambda *args, **kwargs: None

# CLI arguments for input/output and IDs
script_dir = os.path.dirname(os.path.abspath(__file__))
parser = argparse.ArgumentParser()
parser.add_argument(
    "-i", "--input", dest="input", required=True, help="input image path"
)
parser.add_argument(
    "-o", "--output", dest="output_dir", required=True, help="output directory"
)
parser.add_argument(
    "-t", "--test", dest="test_id", required=True, help="test ID"
)
parser.add_argument(
    "-s", "--student", dest="student_id", required=True, help="student ID"
)
parser.add_argument(
    "-n", dest="n", type=int, default=0, help="check first n boxes"
)
args = parser.parse_args()

input_file = args.input
output_dir = args.output_dir
test_id = args.test_id
student_id = args.student_id
check_n = args.n

# Ensure output directory exists
os.makedirs(output_dir, exist_ok=True)

# Output filenames based on IDs
output_file = os.path.join(output_dir, f"{test_id}-{student_id}.jpg")
output_json = os.path.join(output_dir, f"{test_id}-{student_id}.json")

# Verify input exists
if not os.path.exists(input_file):
    raise FileNotFoundError(f"Input file not found: {input_file}")

def cluster_by_column(boxes, n_cols=4):
    """Cluster boxes into columns based on X position"""
    if not boxes:
        return []
    
    boxes_sorted = sorted(boxes, key=lambda b: b[2], reverse=True)  # Sort by center X, right to left
    
    # Expected column sizes
    total = len(boxes_sorted)
    if total >= 50:
        col_sizes = [15, 15, 15, 10]
    else:
        base = total // n_cols
        rem = total % n_cols
        col_sizes = [base + (1 if i < rem else 0) for i in range(n_cols)]
    
    columns = []
    start_idx = 0
    for size in col_sizes:
        if start_idx + size <= len(boxes_sorted):
            columns.append(boxes_sorted[start_idx:start_idx + size])
            start_idx += size
    
    return columns

def infer_missing_boxes(columns, expected_structure):
    """Infer missing boxes based on spatial relationships and expected structure"""
    all_boxes = {}
    
    for col_idx, column in enumerate(columns):
        if not column:
            continue
        
        # Sort by Y position
        column_sorted = sorted(column, key=lambda b: b[3])
        
        # Expected question numbers for this column
        if col_idx == 0:
            expected_nums = list(range(1, 16))
        elif col_idx == 1:
            expected_nums = list(range(16, 31))
        elif col_idx == 2:
            expected_nums = list(range(31, 46))
        else:
            expected_nums = list(range(46, 56))
        
        # Calculate average spacing
        if len(column_sorted) > 1:
            y_positions = [b[3] for b in column_sorted]
            spacings = [y_positions[i+1] - y_positions[i] for i in range(len(y_positions)-1)]
            avg_spacing = np.median(spacings) if spacings else 0
        else:
            avg_spacing = 70  # Default spacing
        
        # Assign detected boxes to question numbers
        for i, box in enumerate(column_sorted):
            if i < len(expected_nums):
                q_num = expected_nums[i]
                all_boxes[q_num] = {
                    'rect': box[1],
                    'detected': True,
                    'orig_idx': box[0]
                }
        
        # Infer missing boxes
        for i, q_num in enumerate(expected_nums):
            if q_num not in all_boxes:
                # Try to infer position
                if i > 0 and (q_num - 1) in all_boxes:
                    # Use box above
                    ref_box = all_boxes[q_num - 1]['rect']
                    inferred_rect = (
                        ref_box[0],
                        int(ref_box[1] + avg_spacing),
                        ref_box[2],
                        ref_box[3]
                    )
                elif i < len(expected_nums) - 1 and (q_num + 1) in all_boxes:
                    # Use box below
                    ref_box = all_boxes[q_num + 1]['rect']
                    inferred_rect = (
                        ref_box[0],
                        int(ref_box[1] - avg_spacing),
                        ref_box[2],
                        ref_box[3]
                    )
                elif column_sorted:
                    # Use first box and extrapolate
                    ref_box = column_sorted[0][1]
                    inferred_rect = (
                        ref_box[0],
                        int(ref_box[1] + i * avg_spacing),
                        ref_box[2],
                        ref_box[3]
                    )
                else:
                    continue
                
                all_boxes[q_num] = {
                    'rect': inferred_rect,
                    'detected': False,
                    'orig_idx': None
                }
    
    return all_boxes

def detect_answer_intensity(src_rgb, circles, threshold_factor=0.85):
    """
    Detect marked answer based on intensity with adaptive thresholding.
    Returns answer letter or "-" if none detected.
    """
    if not circles:
        return "-"
    
    darkness_vals = []
    letter_map = {0: "D", 1: "C", 2: "B", 3: "A"}  # Reversed order
    
    for ci, (cx, cy, r) in enumerate(circles):
        sample_r = 6
        xx0, yy0 = max(0, cx - sample_r), max(0, cy - sample_r)
        xx1, yy1 = min(src_rgb.shape[1], cx + sample_r), min(src_rgb.shape[0], cy + sample_r)
        
        if xx1 <= xx0 or yy1 <= yy0:
            darkness_vals.append((ci, 255))
            continue
        
        patch = src_rgb[yy0:yy1, xx0:xx1]
        if patch.size == 0:
            darkness_vals.append((ci, 255))
            continue
        
        gray_patch = cv2.cvtColor(patch, cv2.COLOR_RGB2GRAY)
        mean_intensity = float(np.mean(gray_patch))
        darkness_vals.append((ci, mean_intensity))
    
    if not darkness_vals:
        return "-"
    
    # Find darkest and second darkest
    sorted_darkness = sorted(darkness_vals, key=lambda t: t[1])
    darkest = sorted_darkness[0]
    
    if len(sorted_darkness) > 1:
        second_darkest = sorted_darkness[1]
        # Check if there's a significant difference
        diff = second_darkest[1] - darkest[0]
        avg = np.mean([d[1] for d in darkness_vals])
        
        # If darkest is significantly darker than average, it's marked
        if darkest[1] < avg * threshold_factor and diff > 15:
            return letter_map.get(darkest[0], "-")
    else:
        # Only one circle, check if it's dark enough
        if darkest[1] < 150:
            return letter_map.get(darkest[0], "-")
    
    return "-"

# Create PipelinesConfig with more aggressive settings
cfg = config.PipelinesConfig()
cfg.width_range = (180, 280)
cfg.height_range = (45, 95)
cfg.scaling_factors = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4]
cfg.wh_ratio_range = (2.0, 5.0)
cfg.group_size_range = (1, 10)  # type: ignore[assignment]
cfg.dilation_iterations = [2]  # type: ignore[assignment]
cfg.morph_kernels_thickness = [3]  # type: ignore[assignment]

try:
    print(f"Processing file: {input_file}")
    rects, _, _, output_image = get_boxes(input_file, cfg=cfg, plot=False)

    if output_image is not None:
        output_image_bgr = cv2.cvtColor(output_image, cv2.COLOR_RGB2BGR)
        rects_list = [tuple(r) for r in rects] if rects is not None else []
        
        # Load source image
        src_bgr = cv2.imread(input_file)
        src_rgb = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2RGB) if src_bgr is not None else None
        
        # Prepare boxes with indices and centers
        indexed_boxes = []
        for idx, r in enumerate(rects_list):
            x, y, w, h = r
            cx = x + w / 2.0
            cy = y + h / 2.0
            indexed_boxes.append((idx, r, cx, cy))
        
        # Cluster into columns
        columns = cluster_by_column(indexed_boxes)
        
        # Expected structure: 55 total questions
        expected_structure = {
            0: list(range(1, 16)),    # Column 1: Q1-15
            1: list(range(16, 31)),   # Column 2: Q16-30
            2: list(range(31, 46)),   # Column 3: Q31-45
            3: list(range(46, 56))    # Column 4: Q46-55
        }
        
        # Infer missing boxes
        all_boxes = infer_missing_boxes(columns, expected_structure)
        
        # Create circle positions for all boxes
        detected_circles_per_box = {}
        shrink_factor = 0.7
        rel_y = 29
        const_r = 12
        
        for q_num in range(1, 56):
            if q_num not in all_boxes:
                continue
            
            box_info = all_boxes[q_num]
            rect = box_info['rect']
            x, y, w, h = rect
            
            margin_left = int(w * 0.15)
            anchor_rel_x = margin_left
            raw_span = w - 2 * margin_left
            adj_span = raw_span * shrink_factor
            step = adj_span / 3
            
            equi_rel_xs = [anchor_rel_x + i * step for i in range(4)]
            centers = [(int(x + rel_x), int(y + rel_y)) for rel_x in equi_rel_xs]
            
            # Adjust for single-digit question numbers
            if 1 <= q_num <= 9:
                centers = [(cx + 8, cy) for (cx, cy) in centers]
            
            detected_circles_per_box[q_num] = [
                (cx, cy, const_r) for (cx, cy) in centers
            ]
        
        # Answer detection
        if check_n and check_n > 0 and src_rgb is not None:
            max_check = min(check_n, 55)
            json_results = {}
            darkest_center_map = {}
            
            for box_num in range(1, max_check + 1):
                if box_num not in all_boxes:
                    json_results[str(box_num)] = "-"
                    continue
                
                box_info = all_boxes[box_num]
                
                # If box wasn't detected, mark as "-"
                if not box_info['detected']:
                    json_results[str(box_num)] = "-"
                    continue
                
                circles = detected_circles_per_box.get(box_num, [])
                if not circles:
                    json_results[str(box_num)] = "-"
                    continue
                
                # Detect answer
                answer = detect_answer_intensity(src_rgb, circles)
                json_results[str(box_num)] = answer
                
                # Store for visualization
                if answer != "-":
                    letter_to_idx = {"A": 3, "B": 2, "C": 1, "D": 0}
                    darkest_center_map[box_num] = letter_to_idx.get(answer, None)
            
            # Draw circles + fill selected
            for box_num, circles in detected_circles_per_box.items():
                if box_num > max_check:
                    continue
                
                chosen_idx = darkest_center_map.get(box_num)
                
                for i, (cx, cy, r) in enumerate(circles):
                    if i == chosen_idx:
                        # Blue fill for selected answer
                        cv2.circle(output_image_bgr, (cx, cy), r, (255, 0, 0), -1, cv2.LINE_AA)
                    else:
                        # Green outline for unselected
                        cv2.circle(output_image_bgr, (cx, cy), r, (0, 255, 0), 2, cv2.LINE_AA)
                
                # Mark undetected boxes with red X
                if box_num in all_boxes and not all_boxes[box_num]['detected']:
                    rect = all_boxes[box_num]['rect']
                    x, y, w, h = rect
                    cv2.line(output_image_bgr, (x, y), (x+w, y+h), (0, 0, 255), 3)
                    cv2.line(output_image_bgr, (x+w, y), (x, y+h), (0, 0, 255), 3)
            
            with open(output_json, "w") as jf:
                json.dump(json_results, jf, indent=2)
            
            cv2.imwrite(output_file, output_image_bgr)
            print(f"Output image saved as: {output_file}")
            print(f"Detected {len([b for b in all_boxes.values() if b['detected']])} out of 55 boxes")
        else:
            print("Warning: No output image was generated or check_n not set")

except FileNotFoundError:
    print(f"Error: Input file '{input_file}' not found.")
except Exception as e:
    print(f"Error processing image: {str(e)}")
    import traceback
    traceback.print_exc()

print("Box detection completed!")
