import os
from boxdetect import config
from boxdetect.pipelines import get_boxes
import matplotlib.pyplot as plt
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
parser.add_argument('-i', '--input', dest='input', required=True, help='input image path')
parser.add_argument('-o', '--output', dest='output_dir', required=True, help='output directory')
parser.add_argument('-t', '--test', dest='test_id', required=True, help='test ID')
parser.add_argument('-s', '--student', dest='student_id', required=True, help='student ID')
parser.add_argument('-n', dest='n', type=int, default=0, help='check first n boxes')
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

# Verify input exists early and provide a clear error if not
if not os.path.exists(input_file):
    raise FileNotFoundError(f"Input file not found: {input_file}")

# Create PipelinesConfig
cfg = config.PipelinesConfig()

# Configure based on your box sizes
cfg.width_range = (200, 260)   # Width range with tolerance
cfg.height_range = (55, 85)    # Height range with tolerance
cfg.scaling_factors = [0.7, 1.0, 1.3]
cfg.wh_ratio_range = (2.5, 4.5)
cfg.group_size_range = (1, 10)
cfg.dilation_iterations = 2
cfg.morph_kernels_thickness = 3

try:
    print(f"Processing file: {input_file}")
    
    # Run box detection
    rects, grouping_rects, image, output_image = get_boxes(
        input_file, 
        cfg=cfg, 
        plot=False
    )
    
    print(f"Detected {len(rects)} individual rectangles")
    print(f"Detected {len(grouping_rects)} grouped rectangles")
    
    if output_image is not None:
        # Convert RGB to BGR for OpenCV drawing/saving
        output_image_bgr = cv2.cvtColor(output_image, cv2.COLOR_RGB2BGR)

        # Number boxes right-to-left in columns, top-to-bottom within each column.
        rects_list = [tuple(r) for r in rects] if rects is not None else []

        numbering = {}
        total = len(rects_list)
        if total > 0:
            # Create list of (original_index, rect, center_x, center_y)
            indexed = []
            for idx, r in enumerate(rects_list):
                x, y, w, h = r
                cx = x + w / 2.0
                cy = y + h / 2.0
                indexed.append((idx, r, cx, cy))

            # Sort by center_x descending (right to left)
            indexed.sort(key=lambda it: it[2], reverse=True)

            if total == 55:
                col_counts = [15, 15, 15, 10]
            else:
                base = total // 4
                rem = total % 4
                col_counts = []
                for i in range(4):
                    add = 1 if i < rem else 0
                    col_counts.append(base + add)

            # Partition into columns
            cols = []
            start = 0
            for c in col_counts:
                cols.append(indexed[start:start + c])
                start += c

            # Assign numbers column by column
            current_number = 1
            for col in cols:
                col_sorted = sorted(col, key=lambda it: it[3])
                for it in col_sorted:
                    orig_idx, rect, cx, cy = it
                    numbering[orig_idx] = current_number
                    current_number += 1

            # Draw box numbers
            font = cv2.FONT_HERSHEY_SIMPLEX
            for idx, rect in enumerate(rects_list):
                if idx not in numbering: continue
                label = str(numbering[idx])
                x, y, w, h = rect
                margin = max(4, int(min(w, h) * 0.05))
                font_scale = 0.45
                thickness = 1
                (text_w, text_h), _ = cv2.getTextSize(label, font, font_scale, thickness)
                text_x = int(x + w - margin - text_w)
                text_y = int(y + margin + text_h)
                cv2.putText(output_image_bgr, label, (text_x, text_y), font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)

        # Load source image
        src_bgr = cv2.imread(input_file)
        src_rgb = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2RGB) if src_bgr is not None else None

        # --- NEW ANCHOR + SHRINK FACTOR CIRCLE LOGIC ---
        detected_circles_per_box = {}
        if rects_list:
            shrink_factor = 0.7   # Pull circles closer together
            rel_y = 29            # Approx vertical offset inside box
            const_r = 12          # Circle radius

            for idx, rect in enumerate(rects_list):
                x, y, w, h = rect

                # Fix left-most circle as anchor
                margin_left = int(w * 0.15)
                anchor_rel_x = margin_left
                raw_span = w - 2 * margin_left
                adj_span = raw_span * shrink_factor

                step = adj_span / 3  # 4 circles = 3 gaps
                equi_rel_xs = [anchor_rel_x + i * step for i in range(4)]

                centers = []
                for rel_x in equi_rel_xs:
                    cx = int(x + rel_x)
                    cy = int(y + rel_y)
                    centers.append((cx, cy))

                # Small adjustment for top 9 boxes in first column
                assigned_num = numbering.get(idx)
                if assigned_num is not None and 1 <= assigned_num <= 9:
                    centers = [(cx + 8, cy) for (cx, cy) in centers]

                detected_circles_per_box[idx] = [(cx, cy, const_r) for (cx, cy) in centers]

            # Draw override circles
            for idx, circles in detected_circles_per_box.items():
                numbering_map = {i: 4 - i for i in range(4)}  # right-to-left: 1..4
                for i, (cx, cy, r) in enumerate(circles):
                    cv2.circle(output_image_bgr, (cx, cy), r, (0, 255, 0), 2, cv2.LINE_AA)
                    cv2.circle(output_image_bgr, (cx, cy), 2, (0, 255, 0), -1, cv2.LINE_AA)
                    num_label = str(numbering_map[i])
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale = 0.45
                    thickness = 1
                    (text_w, text_h), _ = cv2.getTextSize(num_label, font, font_scale, thickness)
                    text_org = (int(cx - text_w / 2), int(cy + text_h / 2))
                    cv2.putText(output_image_bgr, num_label, text_org, font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)

        # --- Answer detection ---
        if check_n and check_n > 0 and src_rgb is not None:
            assigned_to_idx = {v: k for k, v in numbering.items()}
            max_check = min(check_n, max(assigned_to_idx.keys())) if assigned_to_idx else 0

            json_results = {}
            darkest_center_map = {}
            letter_map = {1: 'A', 2: 'B', 3: 'C', 4: 'D'}

            for box_num in range(1, max_check + 1):
                idx = assigned_to_idx.get(box_num)
                if idx is None:
                    json_results[str(box_num)] = None
                    continue
                x, y, w, h = rects_list[idx]
                circles = detected_circles_per_box.get(idx, [])
                if not circles:
                    json_results[str(box_num)] = None
                    continue

                darkness_vals = []
                for ci, (cx, cy, r) in enumerate(circles, start=1):
                    sample_r = 6
                    xx0 = max(0, cx - sample_r)
                    yy0 = max(0, cy - sample_r)
                    xx1 = cx + sample_r
                    yy1 = cy + sample_r
                    patch = src_rgb[yy0:yy1, xx0:xx1]
                    if patch is None or patch.size == 0:
                        continue
                    gray_patch = cv2.cvtColor(cv2.cvtColor(patch, cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2GRAY)
                    mean_intensity = float(np.mean(gray_patch))
                    darkness_vals.append((ci, mean_intensity))

                if not darkness_vals:
                    json_results[str(box_num)] = None
                    continue

                darkest = min(darkness_vals, key=lambda t: t[1])
                darkest_circle_num = darkest[0]
                reversed_num = 5 - darkest_circle_num
                json_results[str(box_num)] = letter_map.get(reversed_num, None)
                darkest_center_map[box_num] = darkest_circle_num - 1

            # Create filled overlay
            overlay = output_image_bgr.copy()
            alpha = 0.65
            fill_radius = 12
            for box_num_str, letter in json_results.items():
                if letter is None: continue
                box_num = int(box_num_str)
                idx = assigned_to_idx.get(box_num)
                if idx is None: continue
                circles = detected_circles_per_box.get(idx, [])
                if not circles: continue
                center_idx0 = darkest_center_map.get(box_num)
                if center_idx0 is not None and 0 <= center_idx0 < len(circles):
                    cx, cy, r = circles[center_idx0]
                    cv2.circle(overlay, (cx, cy), fill_radius, (0, 150, 0), -1, cv2.LINE_AA)

            cv2.addWeighted(overlay, alpha, output_image_bgr, 1 - alpha, 0, output_image_bgr)
            with open(output_json, 'w') as jf:
                json.dump(json_results, jf, indent=2)
            cv2.imwrite(output_file, output_image_bgr)
            print(f"Output image saved as: {output_file}")
        else:
            print("Warning: No output image was generated")
        
except FileNotFoundError:
    print(f"Error: Input file '{input_file}' not found.")
except Exception as e:
    print(f"Error processing image: {str(e)}")

print("Box detection completed!")