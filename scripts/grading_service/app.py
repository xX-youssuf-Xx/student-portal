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
# Box dimensions from your data: w=232, h=69
# Adding some tolerance for detection
cfg.width_range = (200, 260)   # Width range with tolerance
cfg.height_range = (55, 85)    # Height range with tolerance

# Scaling factors - adjust based on image resolution
cfg.scaling_factors = [0.7, 1.0, 1.3]

# Width to height ratio range (w/h ratio for your boxes: 232/69 ≈ 3.36)
cfg.wh_ratio_range = (2.5, 4.5)

# Group size range - set to detect individual boxes or groups
cfg.group_size_range = (1, 10)

# Morphological operations settings
cfg.dilation_iterations = 2

# Line thickness and other detection parameters
cfg.morph_kernels_thickness = 3

try:
    print(f"Processing file: {input_file}")
    print(f"Looking for boxes with dimensions approximately: w=232, h=69")
    print(f"Configuration:")
    print(f"  Width range: {cfg.width_range}")
    print(f"  Height range: {cfg.height_range}")
    print(f"  W/H ratio range: {cfg.wh_ratio_range}")
    print(f"  Scaling factors: {cfg.scaling_factors}")
    print()
    
    # Run box detection
    rects, grouping_rects, image, output_image = get_boxes(
        input_file, 
        cfg=cfg, 
        plot=False
    )
    
    print(f"Detected {len(rects)} individual rectangles")
    print(f"Detected {len(grouping_rects)} grouped rectangles")
    print()
    
    # Use explicit length checks (handles numpy arrays) instead of `if rects:` which can raise
    if rects is not None and len(rects) > 0:
        print("Individual rectangles (x, y, w, h):")
        for i, rect in enumerate(rects):
            x, y, w, h = rect
            area = w * h
            print(f"  Box {i+1}: x={x}, y={y}, w={w}, h={h}, area={area}")
        print()
    
    if grouping_rects is not None and len(grouping_rects) > 0:
        print("Grouped rectangles (x, y, w, h):")
        for i, rect in enumerate(grouping_rects):
            x, y, w, h = rect
            area = w * h
            print(f"  Group {i+1}: x={x}, y={y}, w={w}, h={h}, area={area}")
        print()
    
    # Save the output image
    if output_image is not None:
        # Convert RGB to BGR for OpenCV drawing/saving
        output_image_bgr = cv2.cvtColor(output_image, cv2.COLOR_RGB2BGR)

        # Number boxes right-to-left in columns, top-to-bottom within each column.
        # Desired counts per column (from rightmost to leftmost): 15,15,15,10
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
                # Split into 4 groups as evenly as possible (right-to-left)
                base = total // 4
                rem = total % 4
                # distribute remainder to the first (rightmost) columns
                col_counts = []
                for i in range(4):
                    add = 1 if i < rem else 0
                    col_counts.append(base + add)

            # Partition into columns according to col_counts
            cols = []
            start = 0
            for c in col_counts:
                if c <= 0:
                    cols.append([])
                    continue
                cols.append(indexed[start:start + c])
                start += c

            # Assign numbers column by column (rightmost to leftmost), top-to-bottom within each column
            current_number = 1
            for col in cols:
                # sort this column by center_y ascending (top to bottom)
                col_sorted = sorted(col, key=lambda it: it[3])
                for it in col_sorted:
                    orig_idx, rect, cx, cy = it
                    numbering[orig_idx] = current_number
                    current_number += 1

            # Draw numbers for each rectangle using original rect coordinates/order
            font = cv2.FONT_HERSHEY_SIMPLEX
            for idx, rect in enumerate(rects_list):
                if idx not in numbering:
                    continue
                label = str(numbering[idx])
                x, y, w, h = rect

                # Small black text in the top-right corner inside the box
                margin = max(4, int(min(w, h) * 0.05))
                font_scale = 0.45
                thickness = 1

                (text_w, text_h), _ = cv2.getTextSize(label, font, font_scale, thickness)
                text_x = int(x + w - margin - text_w)
                text_y = int(y + margin + text_h)

                # Draw black text (no outline)
                cv2.putText(output_image_bgr, label, (text_x, text_y), font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)

        # Ensure we have a NumPy source image for ROI-based circle detection
        src_bgr = cv2.imread(input_file)
        if src_bgr is None:
            print(f"Warning: unable to read source image from {input_file} for ROI circle detection")
            src_rgb = None
        else:
            src_rgb = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2RGB)

        # Detect circles inside each rectangle (up to 4 expected per box)
        detected_circles_per_box = {}
        if rects_list:
            for idx, rect in enumerate(rects_list):
                x, y, w, h = rect
                # Small padding to ensure circle edges are included
                pad = max(2, int(min(w, h) * 0.05))
                x0 = max(0, int(x - pad))
                y0 = max(0, int(y - pad))
                x1 = int(x + w + pad)
                y1 = int(y + h + pad)

                # Use the cv2.imread-loaded image for reliable slicing
                if src_rgb is not None:
                    roi = src_rgb[y0:y1, x0:x1]
                else:
                    # fallback to whatever 'image' is (from get_boxes)
                    try:
                        roi = image[y0:y1, x0:x1]
                    except Exception:
                        roi = None

                if roi is None or getattr(roi, 'size', 0) == 0:
                    detected_circles_per_box[idx] = []
                    continue

                # Darken ROI to improve circle contrast (multiply brightness)
                darken_factor = 0.6  # 0 < factor <= 1.0, lower -> darker
                try:
                    # roi is RGB uint8; convertScaleAbs handles clipping
                    roi = cv2.convertScaleAbs(roi, alpha=darken_factor, beta=0)
                except Exception:
                    # if anything goes wrong, proceed with original roi
                    pass

                # Convert to BGR then gray
                roi_bgr = cv2.cvtColor(roi, cv2.COLOR_RGB2BGR)
                gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
                gray = cv2.medianBlur(gray, 5)

                # Estimate radii range based on box height (diameter roughly ~ h/3 => radius ~ h/6)
                est_min_r = max(2, int(h / 8))
                est_max_r = max(est_min_r + 1, int(h / 3))

                circles = None
                try:
                    circles = cv2.HoughCircles(
                        gray,
                        cv2.HOUGH_GRADIENT,
                        dp=1.2,
                        minDist=max(8, int(h / 3)),
                        param1=50,
                        param2=15,
                        minRadius=est_min_r,
                        maxRadius=est_max_r,
                    )
                except Exception:
                    circles = None

                found = []
                if circles is not None:
                    circles = np.round(circles[0, :]).astype("int")
                    for (cx, cy, r) in circles:
                        # Convert to image coordinates
                        found.append((int(cx + x0), int(cy + y0), int(r)))

                # Fallback: contour-based circle detection if Hough fails or finds <4
                if len(found) < 4:
                    # Adaptive threshold to get blobs
                    _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                    # Invert if background is white
                    white_ratio = np.mean(th == 255)
                    if white_ratio > 0.5:
                        th = cv2.bitwise_not(th)

                    # Remove small noise
                    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
                    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel, iterations=1)

                    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    candidates = []
                    for cnt in contours:
                        area = cv2.contourArea(cnt)
                        if area < 10:
                            continue
                        perimeter = cv2.arcLength(cnt, True)
                        if perimeter == 0:
                            continue
                        circularity = 4 * np.pi * (area / (perimeter * perimeter))
                        if circularity < 0.5:
                            continue
                        (cx_rel, cy_rel), radius = cv2.minEnclosingCircle(cnt)
                        if radius < 2:
                            continue
                        candidates.append((cx_rel, cy_rel, radius, area, circularity))

                    if candidates:
                        median_r = np.median([cc[2] for cc in candidates])
                        candidates = sorted(candidates, key=lambda c: (abs(c[2] - median_r), c[0]))
                    else:
                        candidates = []

                    # take up to 4 largest/suitable
                    for c in candidates[:4]:
                        cx_rel, cy_rel, r, _, _ = c
                        found.append((int(cx_rel + x0), int(cy_rel + y0), int(r)))

                # If more than 4 found, keep the 4 with largest radius
                if len(found) > 4:
                    found = sorted(found, key=lambda f: f[2], reverse=True)[:4]
                # Sort by x (left to right) for consistency
                found = sorted(found, key=lambda f: f[0])

                detected_circles_per_box[idx] = found

            # Draw detected circles on output_image_bgr
            # If the user provided an override pattern, place those relative circles in every box.
            use_override_pattern = True
            # Relative coordinates and radii based on Box 28 sample (rel_x, rel_y, r)
            override_rel_circles = [
                (32, 27, 9),
                (68, 27, 12),
                (107, 27, 12),
                (183, 31, 14),
            ]

            if use_override_pattern and rects_list:
                print("Using override circle pattern for all boxes (equidistant, constant radius=12)")
                # Base relative x positions from Box 28 sample; we'll make them equidistant across that span
                base_rel_xs = [32, 68, 107, 183]
                rel_y = 29  # common vertical offset
                const_r = 12

                for idx, rect in enumerate(rects_list):
                    x, y, w, h = rect

                    # compute equidistant relative x positions across the same span
                    left = min(base_rel_xs)
                    right = max(base_rel_xs)
                    span = right - left
                    shrink_factor = 0.7  # <1.0 moves circles closer to the leftmost fixed circle; adjust as needed
                    new_span = span * shrink_factor
                    equi_rel_xs = left + np.linspace(0, new_span, num=4)

                    # build circle centers absolute coords
                    centers = []
                    for rel_x in equi_rel_xs:
                        cx = int(x + float(rel_x))
                        cy = int(y + float(rel_y))
                        centers.append((cx, cy))

                    # Shift boxes whose assigned box number is 1..9 (first column top 1-9)
                    assigned_num = numbering.get(idx)
                    if assigned_num is not None and 1 <= assigned_num <= 9:
                        centers = [(cx + 8, cy) for (cx, cy) in centers]

                    # Number circles from right to left: sort centers by x descending (rightmost -> 1)
                    sorted_by_x = sorted(enumerate(centers), key=lambda it: it[1][0], reverse=True)
                    numbering_map = {}
                    for num, (center_i, _) in enumerate(sorted_by_x, start=1):
                        numbering_map[center_i] = num

                    # Draw circles and numbers
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    for i, (cx, cy) in enumerate(centers):
                        # draw circle outline
                        cv2.circle(output_image_bgr, (cx, cy), int(const_r), (0, 255, 0), 2, cv2.LINE_AA)
                        cv2.circle(output_image_bgr, (cx, cy), 2, (0, 255, 0), -1, cv2.LINE_AA)

                        # draw small black number at circle center (numbering from right to left)
                        num_label = str(numbering_map[i])
                        font_scale = 0.45
                        thickness = 1
                        (text_w, text_h), _ = cv2.getTextSize(num_label, font, font_scale, thickness)
                        text_org = (int(cx - text_w / 2), int(cy + text_h / 2))
                        cv2.putText(output_image_bgr, num_label, text_org, font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)

                    # print relative coords for this box
                    rel_list = [(int(cx - x), int(cy - y), int(const_r)) for (cx, cy) in centers]
                    print(f"Box {idx+1} override circles (rel_x,rel_y,r): {rel_list}")
            else:
                for idx, circles in detected_circles_per_box.items():
                    for ci, (cx, cy, r) in enumerate(circles, start=1):
                        # small green circle outline
                        cv2.circle(output_image_bgr, (int(cx), int(cy)), int(r), (0, 255, 0), 2, cv2.LINE_AA)
                        # small center dot
                        cv2.circle(output_image_bgr, (int(cx), int(cy)), 2, (0, 255, 0), -1, cv2.LINE_AA)

            # Print summary
            for idx in range(len(rects_list)):
                cnt = len(detected_circles_per_box.get(idx, []))
                print(f"Box {idx+1}: detected {cnt} circle(s)")

            # Output coordinates relative to the box for boxes 28,29,30 (1-based indices)
            targets = [28, 29, 30]
            for b in targets:
                idx = b - 1
                print(f"\nBox {b} coordinates:")
                if idx < 0 or idx >= len(rects_list):
                    print(f"  Box {b} not found (index out of range)")
                    continue
                x, y, w, h = rects_list[idx]
                circles = detected_circles_per_box.get(idx, [])
                print(f"  Box rect (x,y,w,h) = ({x}, {y}, {w}, {h})")
                if not circles:
                    print("  No circles detected in this box")
                    continue
                for i, (cx, cy, r) in enumerate(circles, start=1):
                    rel_x = int(cx - x)
                    rel_y = int(cy - y)
                    print(f"  Circle {i}: abs=({int(cx)},{int(cy)}), rel=({rel_x},{rel_y}), r={int(r)}")

        else:
            print("No rectangles to detect circles in.")

        # Overlay fill will be done after computing json_results in the check_n block

    # Optional: Display results using matplotlib (comment out if running headless)
    """
    plt.figure(figsize=(15, 10))
    plt.imshow(output_image)
    plt.title('Box Detection Results')
    plt.axis('off')
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'output_matplotlib.png'), 
                bbox_inches='tight', dpi=150)
    plt.show()
    """
    
    # After drawing and printing, if check_n > 0 compute darkest circle per box among 1..n
    if check_n and check_n > 0:
        # Build reverse mapping from assigned number to rect index
        assigned_to_idx = {v: k for k, v in numbering.items()}
        max_check = min(check_n, max(assigned_to_idx.keys())) if assigned_to_idx else 0

        # Compute darkest circle per box and build json_results and map of darkest center indices
        letter_map = {1: 'A', 2: 'B', 3: 'C', 4: 'D'}
        json_results = {}
        darkest_center_map = {}  # box_num -> center_index (0-based, left->right order)

        for box_num in range(1, max_check + 1):
            idx = assigned_to_idx.get(box_num)
            if idx is None:
                json_results[str(box_num)] = None
                continue
            x, y, w, h = rects_list[idx]
            left = min(base_rel_xs)
            right = max(base_rel_xs)
            span = right - left
            new_span = span * shrink_factor
            equi_rel_xs = left + np.linspace(0, new_span, num=4)
            centers = [(int(x + float(rx)), int(y + float(rel_y))) for rx in equi_rel_xs]
            if numbering.get(idx) is not None and 1 <= numbering[idx] <= 9:
                centers = [(cx + 8, cy) for (cx, cy) in centers]

            darkness_vals = []
            for ci, (cx, cy) in enumerate(centers, start=1):
                sample_r = 6
                xx0 = max(0, cx - sample_r)
                yy0 = max(0, cy - sample_r)
                xx1 = cx + sample_r
                yy1 = cy + sample_r
                patch = src_rgb[yy0:yy1, xx0:xx1]
                if patch is None or getattr(patch, 'size', 0) == 0:
                    darkness_vals.append((ci, float('inf')))
                    continue
                gray_patch = cv2.cvtColor(cv2.cvtColor(patch, cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2GRAY)
                mean_intensity = float(np.mean(gray_patch))
                darkness_vals.append((ci, mean_intensity))

            darkest = min(darkness_vals, key=lambda t: t[1])
            darkest_circle_num = darkest[0]
            # Reverse the answer mapping (do not change image numbering): map n -> 5-n
            reversed_num = 5 - darkest_circle_num
            json_results[str(box_num)] = letter_map.get(reversed_num, None)
            # store center index (0-based from left->right)
            darkest_center_map[box_num] = darkest_circle_num - 1

        # Create overlay and fill darkest circles
        overlay = output_image_bgr.copy()
        alpha = 0.65  # increased opacity
        fill_radius = 12  # slightly larger fill
        for box_num_str, letter in json_results.items():
            if letter is None:
                continue
            box_num = int(box_num_str)
            idx = assigned_to_idx.get(box_num)
            if idx is None:
                continue
            x, y, w, h = rects_list[idx]
            left = min(base_rel_xs)
            right = max(base_rel_xs)
            span = right - left
            new_span = span * shrink_factor
            equi_rel_xs = left + np.linspace(0, new_span, num=4)
            centers = [(int(x + float(rx)), int(y + float(rel_y))) for rx in equi_rel_xs]
            if numbering.get(idx) is not None and 1 <= numbering[idx] <= 9:
                centers = [(cx + 8, cy) for (cx, cy) in centers]

            center_idx0 = darkest_center_map.get(box_num)
            if center_idx0 is not None and 0 <= center_idx0 < len(centers):
                cx, cy = centers[center_idx0]
                # darker green fill
                cv2.circle(overlay, (cx, cy), fill_radius, (0, 150, 0), -1, cv2.LINE_AA)

        cv2.addWeighted(overlay, alpha, output_image_bgr, 1 - alpha, 0, output_image_bgr)

        # Save JSON and final image to requested output paths
        with open(output_json, 'w') as jf:
            json.dump(json_results, jf, indent=2)
        cv2.imwrite(output_file, output_image_bgr)
        print(f"Output image saved as: {output_file}")
    else:
        print("Warning: No output image was generated")
        
except FileNotFoundError:
    print(f"Error: Input file '{input_file}' not found.")
    print("Please make sure the file exists at the specified path.")
except Exception as e:
    print(f"Error processing image: {str(e)}")
    print("Try adjusting the configuration parameters if detection fails.")

print("Box detection completed!")