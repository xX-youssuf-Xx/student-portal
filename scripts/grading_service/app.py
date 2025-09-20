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

# Create PipelinesConfig
cfg = config.PipelinesConfig()
cfg.width_range = (200, 260)
cfg.height_range = (55, 85)
cfg.scaling_factors = [0.7, 1.0, 1.3]
cfg.wh_ratio_range = (2.5, 4.5)
cfg.group_size_range = (1, 10)
cfg.dilation_iterations = 2
cfg.morph_kernels_thickness = 3

try:
    print(f"Processing file: {input_file}")
    rects, _, _, output_image = get_boxes(input_file, cfg=cfg, plot=False)

    if output_image is not None:
        output_image_bgr = cv2.cvtColor(output_image, cv2.COLOR_RGB2BGR)

        rects_list = [tuple(r) for r in rects] if rects is not None else []
        numbering = {}
        total = len(rects_list)

        if total > 0:
            indexed = []
            for idx, r in enumerate(rects_list):
                x, y, w, h = r
                cx = x + w / 2.0
                cy = y + h / 2.0
                indexed.append((idx, r, cx, cy))

            # Sort by X descending (right to left)
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
            cols, start = [], 0
            for c in col_counts:
                cols.append(indexed[start : start + c])
                start += c

            current_number = 1
            for col in cols:
                col_sorted = sorted(col, key=lambda it: it[3])
                for it in col_sorted:
                    orig_idx, _, _, _ = it
                    numbering[orig_idx] = current_number
                    current_number += 1

        # Load source image
        src_bgr = cv2.imread(input_file)
        src_rgb = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2RGB) if src_bgr is not None else None

        # --- Circle placement: left-anchor + shrink factor ---
        detected_circles_per_box = {}
        shrink_factor = 0.7
        rel_y = 29
        const_r = 12

        for idx, rect in enumerate(rects_list):
            x, y, w, h = rect
            margin_left = int(w * 0.15)
            anchor_rel_x = margin_left
            raw_span = w - 2 * margin_left
            adj_span = raw_span * shrink_factor
            step = adj_span / 3

            equi_rel_xs = [anchor_rel_x + i * step for i in range(4)]
            centers = [(int(x + rel_x), int(y + rel_y)) for rel_x in equi_rel_xs]

            if numbering.get(idx) is not None and 1 <= numbering[idx] <= 9:
                centers = [(cx + 8, cy) for (cx, cy) in centers]

            detected_circles_per_box[idx] = [
                (cx, cy, const_r) for (cx, cy) in centers
            ]

        # --- Answer detection ---
        if check_n and check_n > 0 and src_rgb is not None:
            assigned_to_idx = {v: k for k, v in numbering.items()}
            max_check = min(check_n, max(assigned_to_idx.keys())) if assigned_to_idx else 0

            json_results = {}
            darkest_center_map = {}
            letter_map = {1: "A", 2: "B", 3: "C", 4: "D"}

            for box_num in range(1, max_check + 1):
                idx = assigned_to_idx.get(box_num)
                if idx is None:
                    json_results[str(box_num)] = None
                    continue
                circles = detected_circles_per_box.get(idx, [])
                if not circles:
                    json_results[str(box_num)] = None
                    continue

                darkness_vals = []
                for ci, (cx, cy, r) in enumerate(circles, start=1):
                    sample_r = 6
                    xx0, yy0 = max(0, cx - sample_r), max(0, cy - sample_r)
                    xx1, yy1 = cx + sample_r, cy + sample_r
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

            # Draw circles + fill selected in BLUE
            for idx, circles in detected_circles_per_box.items():
                box_num = numbering.get(idx)
                if box_num is None or box_num > max_check:
                    continue
                chosen_idx = darkest_center_map.get(box_num)

                for i, (cx, cy, r) in enumerate(circles):
                    if i == chosen_idx:
                        cv2.circle(output_image_bgr, (cx, cy), r, (255, 0, 0), -1, cv2.LINE_AA)  # Blue fill
                    else:
                        cv2.circle(output_image_bgr, (cx, cy), r, (0, 255, 0), 2, cv2.LINE_AA)  # Green outline

            with open(output_json, "w") as jf:
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