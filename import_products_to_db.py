import os
import sqlite3
import json
import shutil

def main():
    src_dir = "C:/Users/NAITIK/.gemini/antigravity/scratch/image-processor/output_images"
    dest_dir = "C:/Users/NAITIK/.gemini/antigravity/scratch/little-to-large/public/images/products"
    db_path = "C:/Users/NAITIK/.gemini/antigravity/scratch/little-to-large/little_to_large.db"
    
    if not os.path.exists(src_dir):
        print(f"[ERROR] Source processed images folder not found at: {src_dir}")
        return

    # Ensure public products directory exists
    os.makedirs(dest_dir, exist_ok=True)
    
    # Open database connection
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Clear existing products to ensure clean insertion
    cursor.execute("DELETE FROM products")
    conn.commit()
    print("Cleared existing products from the database.")
    
    # Map of custom products with details
    premium_products = {
        "Green_Floral_Womens_Kurta": {
            "name": "Green Floral Women's Kurta",
            "category": "Women",
            "subcategory": "Ethnic",
            "price": 1299.00,
            "discount_price": 999.00,
            "stock": 50,
            "description": "Elegant green floral cotton Kurta, comfortable and fashionable for casual or festive wear.",
            "size_variants": "S,M,L,XL,XXL",
            "rating": 4.8
        },
        "Green_Spiderman_Kids_Set": {
            "name": "Green Spider-Man Kids Set",
            "category": "Kids",
            "subcategory": "Boys",
            "price": 699.00,
            "discount_price": 499.00,
            "stock": 35,
            "description": "Cute green singlet and shorts set featuring Spider-Man cartoon print. Made from 100% breathable cotton.",
            "size_variants": "2T,3T,4T,5T",
            "rating": 4.7
        },
        "Beige_Rabbit_Kids_Set": {
            "name": "Beige Rabbit Kids Set",
            "category": "Kids",
            "subcategory": "Boys",
            "price": 799.00,
            "discount_price": 599.00,
            "stock": 40,
            "description": "Adorable beige singlet and shorts set with rabbit graphics and 'TRUST ME' branding. Cozy fabric for daily wear.",
            "size_variants": "2T,3T,4T,5T",
            "rating": 4.9
        },
        "Product_5": {
            "name": "Grey Cartoon Vehicle Singlet",
            "category": "Kids",
            "subcategory": "Boys",
            "price": 499.00,
            "discount_price": 349.00,
            "stock": 25,
            "description": "Grey cotton singlet featuring cartoon Mickey Mouse and vehicle prints.",
            "size_variants": "2T,3T,4T",
            "rating": 4.5
        },
        "Product_6": {
            "name": "Pink Cartoon Vehicle Kids Set",
            "category": "Kids",
            "subcategory": "Girls",
            "price": 799.00,
            "discount_price": 599.00,
            "stock": 30,
            "description": "Pink cartoon print singlet and shorts set featuring Mickey Mouse and vehicle graphics. Comfort fit.",
            "size_variants": "2T,3T,4T",
            "rating": 4.6
        },
        "Product_11": {
            "name": "Fuchsia Minions Kids Set",
            "category": "Kids",
            "subcategory": "Girls",
            "price": 799.00,
            "discount_price": 599.00,
            "stock": 45,
            "description": "Bright fuchsia singlet and shorts set featuring Minions graphics and 'MINIONS VITAMINS' lettering.",
            "size_variants": "2T,3T,4T,5T",
            "rating": 4.8
        }
    }
    
    # Process and copy folders
    folders = [f for f in os.listdir(src_dir) if os.path.isdir(os.path.join(src_dir, f))]
    
    print("\nCopying product images to public folder and inserting into DB...")
    print("=" * 60)
    
    inserted_count = 0
    for folder in folders:
        src_path = os.path.join(src_dir, folder)
        dest_path = os.path.join(dest_dir, folder)
        
        # Copy folder content
        if os.path.exists(dest_path):
            shutil.rmtree(dest_path)
        shutil.copytree(src_path, dest_path)
        
        # Compile relative urls
        files = os.listdir(dest_path)
        image_urls = [f"images/products/{folder}/{f}" for f in files if f.endswith(('.png', '.jpg', '.jpeg'))]
        # Sort to ensure front.png is always first
        image_urls.sort(key=lambda x: 0 if "front.png" in x else 1)
        
        # Get metadata
        details = premium_products.get(folder, {
            "name": f"Little to Large {folder.replace('_', ' ')}",
            "category": "Kids",
            "subcategory": "Boys",
            "price": 599.00,
            "discount_price": 499.00,
            "stock": 20,
            "description": "Premium cotton kids clothing set from Little to Large clothing collection.",
            "size_variants": "S,M,L",
            "rating": 4.5
        })
        
        # Insert into SQLite products table
        cursor.execute("""
            INSERT INTO products (name, category, subcategory, price, discount_price, stock, description, size_variants, image_urls, rating, fabric, color, style, gender)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            details["name"],
            details["category"],
            details["subcategory"],
            details["price"],
            details["discount_price"],
            details["stock"],
            details["description"],
            details["size_variants"],
            json.dumps(image_urls),
            details["rating"],
            "Cotton",
            "Green" if "Green" in details["name"] else "Multicolor",
            "Casual",
            "Unisex" if details["category"] == "Kids" else details["category"]
        ))
        
        inserted_count += 1
        print(f"[SUCCESS] Seeded {details['name']} with {len(image_urls)} images.")
        
    conn.commit()
    conn.close()
    
    print("=" * 60)
    print(f"Database seeding finished! {inserted_count} products added to SQLite.")

if __name__ == "__main__":
    main()
