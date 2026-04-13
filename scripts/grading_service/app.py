import os
from boxdetect import config
from boxdetect.pipelines import get_boxes
import cv2
import numpy as np
import argparse
import json
import logging
import sys

logging.basicConfig(
    level=logging.ERROR,
    format="[GRADING] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)

# CLI arguments for input/output and IDs
script_dir = os.path.dirname(os.path.abspath(__file__))
parser = argparse.ArgumentParser()
parser.add_argument(
    "-i", "--input", dest="input", required=True, help="input image path"
)
parser.add_argument(
    "-o", "--output", dest="output_dir", required=True, help="output directory"
)
parser.add_argument("-t", "--test", dest="test_id", required=True, help="test ID")
parser.add_argument(
    "-s", "--student", dest="student_id", required=True, help="student ID"
)
parser.add_argument("-n", dest="n", type=int, default=0, help="check first n boxes")
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

input_abs = os.path.abspath(input_file)
for output_path in [output_file, output_json]:
    output_abs = os.path.abspath(output_path)
    if output_abs == input_abs:
        print(f"[GRADING] skipping deletion because input==output: {output_path}")
        continue
    if os.path.exists(output_path):
        os.remove(output_path)


def cluster_by_column(boxes, n_cols=4):
    """Cluster boxes into columns based on X position"""
    if not boxes:
        return []

    boxes_sorted = sorted(
        boxes, key=lambda b: b[2], reverse=True
    )  # Sort by center X, right to left

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
            columns.append(boxes_sorted[start_idx : start_idx + size])
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
            spacings = [
                y_positions[i + 1] - y_positions[i] for i in range(len(y_positions) - 1)
            ]
            avg_spacing = np.median(spacings) if spacings else 0
        else:
            avg_spacing = 70  # Default spacing

        # Assign detected boxes to question numbers
        for i, box in enumerate(column_sorted):
            if i < len(expected_nums):
                q_num = expected_nums[i]
                all_boxes[q_num] = {
                    "rect": box[1],
                    "detected": True,
                    "orig_idx": box[0],
                }

        # Infer missing boxes
        for i, q_num in enumerate(expected_nums):
            if q_num not in all_boxes:
                # Try to infer position
                if i > 0 and (q_num - 1) in all_boxes:
                    # Use box above
                    ref_box = all_boxes[q_num - 1]["rect"]
                    inferred_rect = (
                        ref_box[0],
                        int(ref_box[1] + avg_spacing),
                        ref_box[2],
                        ref_box[3],
                    )
                elif i < len(expected_nums) - 1 and (q_num + 1) in all_boxes:
                    # Use box below
                    ref_box = all_boxes[q_num + 1]["rect"]
                    inferred_rect = (
                        ref_box[0],
                        int(ref_box[1] - avg_spacing),
                        ref_box[2],
                        ref_box[3],
                    )
                elif column_sorted:
                    # Use first box and extrapolate
                    ref_box = column_sorted[0][1]
                    inferred_rect = (
                        ref_box[0],
                        int(ref_box[1] + i * avg_spacing),
                        ref_box[2],
                        ref_box[3],
                    )
                else:
                    continue

                all_boxes[q_num] = {
                    "rect": inferred_rect,
                    "detected": False,
                    "orig_idx": None,
                }

    return all_boxes


def detect_answer_intensity(src_rgb, circles, threshold_factor=0.92, q_num=None):
    """
    Detect marked answer based on intensity with adaptive thresholding.
    Uses multi-signal approach: mean, percentiles, and separation for robust detection.
    Returns answer letter or "-" if none detected.
    """
    if not circles:
        return "-"

    darkness_vals = []
    letter_map = {0: "D", 1: "C", 2: "B", 3: "A"}  # Reversed order

    for ci, (cx, cy, r) in enumerate(circles):
        sample_r = 10
        xx0, yy0 = max(0, cx - sample_r), max(0, cy - sample_r)
        xx1, yy1 = (
            min(src_rgb.shape[1], cx + sample_r),
            min(src_rgb.shape[0], cy + sample_r),
        )

        if xx1 <= xx0 or yy1 <= yy0:
            darkness_vals.append((ci, 255, 255, 255))
            continue

        patch = src_rgb[yy0:yy1, xx0:xx1]
        if patch.size == 0:
            darkness_vals.append((ci, 255, 255, 255))
            continue

        gray_patch = cv2.cvtColor(patch, cv2.COLOR_RGB2GRAY)
        mean_intensity = float(np.mean(gray_patch))
        p10_intensity = float(np.percentile(gray_patch, 10))
        p25_intensity = float(np.percentile(gray_patch, 25))
        p50_intensity = float(np.percentile(gray_patch, 50))
        # Robust darkness score: weighted blend favoring darker pixels
        blended_score = (p10_intensity * 0.3) + (p25_intensity * 0.3) + (mean_intensity * 0.4)
        darkness_vals.append((ci, blended_score, mean_intensity, p25_intensity))

    if not darkness_vals:
        return "-"

    # Find darkest and second darkest
    sorted_darkness = sorted(darkness_vals, key=lambda t: t[1])
    darkest = sorted_darkness[0]

    if len(sorted_darkness) > 1:
        second_darkest = sorted_darkness[1]
        diff = second_darkest[1] - darkest[1]
        avg = np.mean([d[1] for d in darkness_vals])
        darkest_mean = darkest[2]

        if q_num is not None:
            intensities_str = " ".join(
                [
                    f"{letter_map.get(ci, '?')}={int(val)}"
                    for ci, val, _, _ in darkness_vals
                ]
            )
            print(
                f"  Q{q_num}: {intensities_str} | avg={avg:.0f} darkest={letter_map.get(darkest[0], '?')}={darkest[1]:.0f} diff={diff:.0f} thr={avg * threshold_factor:.0f}"
            )

        # Strategy 1: Strong signal - clearly darker than average with good separation
        if darkest[1] < avg * threshold_factor and diff >= 8:
            return letter_map.get(darkest[0], "-")

        # Strategy 2: Medium contrast faint marks - moderate separation is enough
        # for light scans where all bubbles are bright
        if diff >= 6 and darkest[1] < avg * 0.95 and darkest_mean < 220:
            return letter_map.get(darkest[0], "-")

        # Strategy 3: Light pencil - if there's clear separation and not too bright
        # this catches feint but intentional marks
        if diff >= 5 and darkest_mean < 200:
            # Additional safety: second darkest shouldn't be too close to darkest
            if diff < second_darkest[1] * 0.15:  # diff is <15% of second-darkest
                return letter_map.get(darkest[0], "-")

        # Strategy 4: Very strong separation even if average threshold not met
        # This handles overlapping marks or smudges
        if diff >= 15 and darkest[1] < avg * 1.05:
            return letter_map.get(darkest[0], "-")
    else:
        # Only one circle, check if it's dark enough
        if darkest[1] < 175:
            return letter_map.get(darkest[0], "-")

    return "-"


def build_cfg(
    width_range,
    height_range,
    scales,
    wh_ratio=(2.0, 5.0),
    group_size=(1, 10),
    dilation=None,
    kernels=None,
):
    cfg = config.PipelinesConfig()
    cfg.width_range = width_range
    cfg.height_range = height_range
    cfg.scaling_factors = scales
    cfg.wh_ratio_range = wh_ratio
    cfg.group_size_range = group_size  # type: ignore[assignment]
    cfg.dilation_iterations = dilation or [2]  # type: ignore[assignment]
    cfg.morph_kernels_thickness = kernels or [3]  # type: ignore[assignment]
    return cfg


def preprocess_for_detection(image_path, output_root):
    src = cv2.imread(image_path)
    if src is None:
        return None

    gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced = cv2.convertScaleAbs(enhanced, alpha=1.35, beta=-20)
    enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)
    enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    tmp_path = os.path.join(output_root, "_preprocessed_input.jpg")
    cv2.imwrite(tmp_path, enhanced_bgr)
    return tmp_path


def candidate_rank(rects_list):
    """Rank detection candidates by count closeness and box-size consistency."""
    count = len(rects_list)
    if count == 0:
        return (0, 999, 999.0)

    widths = np.array([r[2] for r in rects_list], dtype=np.float32)
    heights = np.array([r[3] for r in rects_list], dtype=np.float32)

    w_mean = float(np.mean(widths)) if widths.size else 1.0
    h_mean = float(np.mean(heights)) if heights.size else 1.0
    w_cv = float(np.std(widths) / max(w_mean, 1e-6))
    h_cv = float(np.std(heights) / max(h_mean, 1e-6))
    consistency_penalty = w_cv + h_cv

    return (min(count, 55), abs(count - 55), consistency_penalty)


def detect_boxes_with_fallback(image_path, output_root):
    presets = [
        (
            "strict",
            build_cfg(
                (180, 280),
                (45, 95),
                [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4],
                wh_ratio=(2.0, 5.0),
                group_size=(1, 10),
                dilation=[2],
                kernels=[3],
            ),
        ),
        (
            "balanced",
            build_cfg(
                (150, 240),
                (35, 80),
                [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2],
                wh_ratio=(1.8, 5.0),
                group_size=(1, 12),
                dilation=[1, 2, 3],
                kernels=[2, 3, 4],
            ),
        ),
        (
            "relaxed",
            build_cfg(
                (120, 260),
                (25, 100),
                [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4],
                wh_ratio=(1.5, 6.0),
                group_size=(1, 14),
                dilation=[1, 2, 3],
                kernels=[2, 3, 4, 5],
            ),
        ),
    ]

    enhanced_input = preprocess_for_detection(image_path, output_root)
    variants = [("original", image_path)]
    if enhanced_input and os.path.exists(enhanced_input):
        variants.append(("enhanced", enhanced_input))

    best_rects = []
    best_output_image = None
    best_variant = "none"
    best_name = "none"
    best_count = 0
    best_rank = (0, 999, 999.0)

    try:
        for variant_name, variant_path in variants:
            for name, cfg in presets:
                rects, _, _, output_image = get_boxes(variant_path, cfg=cfg, plot=False)
                rects_list = [tuple(r) for r in rects] if rects is not None else []
                count = len(rects_list)
                rank = candidate_rank(rects_list)
                print(
                    f"[GRADING] detect variant={variant_name} preset={name} rectangles={count} rank={rank}"
                )

                if output_image is None:
                    continue

                better = (
                    rank[0] > best_rank[0]
                    or (rank[0] == best_rank[0] and rank[1] < best_rank[1])
                    or (
                        rank[0] == best_rank[0]
                        and rank[1] == best_rank[1]
                        and rank[2] < best_rank[2]
                    )
                )

                if better:
                    best_rects = rects_list
                    best_output_image = output_image
                    best_variant = variant_name
                    best_name = name
                    best_rank = rank
                    best_count = count
    finally:
        if enhanced_input and os.path.exists(enhanced_input):
            try:
                os.remove(enhanced_input)
            except OSError:
                pass

    return best_rects, best_output_image, best_variant, best_name, max(best_count, 0)


try:
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")

    print(f"Processing file: {input_file}")
    rects_list, output_image, variant_name, preset_name, preset_rect_count = (
        detect_boxes_with_fallback(input_file, output_dir)
    )
    print(
        f"[GRADING] selected variant={variant_name} preset={preset_name} with {preset_rect_count} rectangles"
    )

    if output_image is not None:
        output_image_bgr = cv2.cvtColor(output_image, cv2.COLOR_RGB2BGR)

        # Load source image
        src_bgr = cv2.imread(input_file)
        src_rgb = (
            cv2.cvtColor(src_bgr, cv2.COLOR_BGR2RGB) if src_bgr is not None else None
        )
        if src_bgr is not None:
            print(f"[GRADING] image size: {src_bgr.shape[1]}x{src_bgr.shape[0]}")

        # Prepare boxes with indices and centers
        indexed_boxes = []
        for idx, r in enumerate(rects_list):
            x, y, w, h = r
            cx = x + w / 2.0
            cy = y + h / 2.0
            indexed_boxes.append((idx, r, cx, cy))
        before_filter_count = len(indexed_boxes)

        # Filter out false positives detected below the bubble-sheet area
        src_h = src_bgr.shape[0] if src_bgr is not None else 0
        if src_h > 0:
            initial_count = len(indexed_boxes)
            primary_ratio = 0.96
            relaxed_ratio = 0.99

            primary_filtered = [
                b for b in indexed_boxes if b[3] < src_h * primary_ratio
            ]
            if len(primary_filtered) >= 45:
                indexed_boxes = primary_filtered
                print(
                    f"[GRADING] bottom filter ratio={primary_ratio:.2f} kept={len(indexed_boxes)}/{initial_count}"
                )
            else:
                relaxed_filtered = [
                    b for b in indexed_boxes if b[3] < src_h * relaxed_ratio
                ]
                if len(relaxed_filtered) >= 45:
                    indexed_boxes = relaxed_filtered
                    print(
                        f"[GRADING] bottom filter ratio={relaxed_ratio:.2f} kept={len(indexed_boxes)}/{initial_count}"
                    )
                else:
                    print(
                        "[GRADING] bottom filter skipped (too few boxes kept by thresholds)"
                    )

        if len(indexed_boxes) > 55:
            indexed_boxes.sort(key=lambda b: (b[3], -(b[1][2] * b[1][3]), b[2]))
            indexed_boxes = indexed_boxes[:55]
        print(
            f"[GRADING] rectangles before filter={before_filter_count} after filter={len(indexed_boxes)}"
        )

        if len(indexed_boxes) == 0:
            logger.error("No candidate boxes detected after filtering")
            sys.exit(1)

        # Cluster into columns
        columns = cluster_by_column(indexed_boxes)

        # Expected structure: 55 total questions
        expected_structure = {
            0: list(range(1, 16)),  # Column 1: Q1-15
            1: list(range(16, 31)),  # Column 2: Q16-30
            2: list(range(31, 46)),  # Column 3: Q31-45
            3: list(range(46, 56)),  # Column 4: Q46-55
        }

        # Infer missing boxes
        all_boxes = infer_missing_boxes(columns, expected_structure)
        detected_box_count = len([b for b in all_boxes.values() if b["detected"]])
        print(f"[GRADING] detected boxes after inference: {detected_box_count}")

        if detected_box_count == 0:
            logger.error("No answer boxes detected after inference")
            sys.exit(1)

        # Create circle positions for all boxes
        detected_circles_per_box = {}
        shrink_factor = 0.7
        rel_y = 29
        const_r = 12

        for q_num in range(1, 56):
            if q_num not in all_boxes:
                continue

            box_info = all_boxes[q_num]
            rect = box_info["rect"]
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
                if not box_info["detected"]:
                    json_results[str(box_num)] = "-"
                    continue

                circles = detected_circles_per_box.get(box_num, [])
                if not circles:
                    json_results[str(box_num)] = "-"
                    continue

                # Detect answer
                answer = detect_answer_intensity(src_rgb, circles, q_num=box_num)
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
                        cv2.circle(
                            output_image_bgr, (cx, cy), r, (255, 0, 0), -1, cv2.LINE_AA
                        )
                    else:
                        # Green outline for unselected
                        cv2.circle(
                            output_image_bgr, (cx, cy), r, (0, 255, 0), 2, cv2.LINE_AA
                        )

                # Mark undetected boxes with red X
                if box_num in all_boxes and not all_boxes[box_num]["detected"]:
                    rect = all_boxes[box_num]["rect"]
                    x, y, w, h = rect
                    cv2.line(output_image_bgr, (x, y), (x + w, y + h), (0, 0, 255), 3)
                    cv2.line(output_image_bgr, (x + w, y), (x, y + h), (0, 0, 255), 3)

            with open(output_json, "w") as jf:
                json.dump(json_results, jf, indent=2)

            cv2.imwrite(output_file, output_image_bgr)
            print(f"Detected {detected_box_count} out of 55 boxes")
            print(f"Output saved: {output_file}")
        else:
            logger.error("No output image generated or n questions was not provided")
            sys.exit(1)
    else:
        logger.error("Box detection returned no output image")
        sys.exit(1)

except FileNotFoundError:
    logger.error(f"Input file '{input_file}' not found.")
    sys.exit(1)
except Exception as e:
    logger.error(f"Error processing image: {str(e)}")
    import traceback

    traceback.print_exc()
    sys.exit(1)
