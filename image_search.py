import os
import sys
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

def extract_svg_features(svg_path):
    """
    Extract color profiles and path complexity metrics from SVG text
    to represent vector graphics as numerical feature vectors.
    """
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        
        colors = []
        path_count = 0
        
        for elem in root.iter():
            fill = elem.attrib.get('fill', '')
            stroke = elem.attrib.get('stroke', '')
            style = elem.attrib.get('style', '')
            
            for attr in [fill, stroke, style]:
                if '#' in attr:
                    start = attr.find('#')
                    color = attr[start:start+7]
                    colors.append(color)
            if elem.tag.endswith('path'):
                path_count += 1
                
        return colors, path_count
    except Exception:
        return [], 0

def load_raster_image_vector(image_path):
    """
    Load JPEG/PNG, resize to small grid and flatten as a NumPy array vector.
    """
    try:
        img = Image.open(image_path).convert('RGB')
        img = img.resize((16, 16))
        arr = np.array(img, dtype=np.float32) / 255.0
        return arr.flatten()
    except Exception:
        return None

def compute_color_similarity(colors1, colors2):
    """
    Calculate color set overlap ratio.
    """
    if not colors1 or not colors2:
        return 0.0
    set1, set2 = set(colors1), set(colors2)
    intersection = set1.intersection(set2)
    union = set1.union(set2)
    return len(intersection) / len(union)

def main():
    if len(sys.argv) < 2:
        print("ERROR: Query image path required.")
        sys.exit(1)
        
    query_path = sys.argv[1]
    products_dir = os.path.join("public", "images", "products")
    uploads_dir = os.path.join("public", "images", "uploads")
    
    if not os.path.exists(query_path):
        print(f"ERROR: File {query_path} not found.")
        sys.exit(1)
        
    query_vector = load_raster_image_vector(query_path)
    query_svg_colors = []
    query_svg_paths = 0
    
    is_query_svg = query_path.lower().endswith('.svg')
    if is_query_svg:
        query_svg_colors, query_svg_paths = extract_svg_features(query_path)
        
    best_match = None
    max_score = -1.0
    
    # Collect all search candidate files from products and uploads folders
    candidates = []
    if os.path.exists(products_dir):
        for f in os.listdir(products_dir):
            candidates.append((products_dir, f, "/images/products/"))
    if os.path.exists(uploads_dir):
        for f in os.listdir(uploads_dir):
            candidates.append((uploads_dir, f, "/images/uploads/"))

    for folder, filename, url_prefix in candidates:
        candidate_path = os.path.join(folder, filename)
        if not os.path.isfile(candidate_path):
            continue
            
        # Ignore temp query uploads
        if filename.startswith('product-') and folder == uploads_dir and filename == os.path.basename(query_path):
            continue

        score = 0.0
        is_cand_svg = candidate_path.lower().endswith('.svg')
        
        if is_cand_svg:
            cand_colors, cand_paths = extract_svg_features(candidate_path)
            if is_query_svg:
                color_score = compute_color_similarity(query_svg_colors, cand_colors)
                path_diff = abs(query_svg_paths - cand_paths)
                path_score = 1.0 / (1.0 + path_diff)
                score = (0.7 * color_score) + (0.3 * path_score)
            else:
                query_colors_hex = []
                if query_vector is not None:
                    pixels = query_vector.reshape(-1, 3)
                    for p in pixels[:10]:
                        r, g, b = int(p[0]*255), int(p[1]*255), int(p[2]*255)
                        query_colors_hex.append(f"#{r:02x}{g:02x}{b:02x}")
                score = compute_color_similarity(query_colors_hex, cand_colors)
        else:
            cand_vector = load_raster_image_vector(candidate_path)
            if query_vector is not None and cand_vector is not None:
                dot_product = np.dot(query_vector, cand_vector)
                norm_q = np.linalg.norm(query_vector)
                norm_c = np.linalg.norm(cand_vector)
                if norm_q > 0 and norm_c > 0:
                    score = dot_product / (norm_q * norm_c)
            else:
                score = 0.0
                
        if score > max_score:
            max_score = score
            best_match = f"{url_prefix}{filename}"
            
    if best_match:
        print(f"MATCH: {best_match}")
    else:
        print("MATCH: NONE")

if __name__ == "__main__":
    main()
