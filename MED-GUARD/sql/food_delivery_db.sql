-- ==============================================================================
-- COMPLETE ALL-IN-ONE FOOD ORDERING SYSTEM DATABASE SCRIPT
-- Swiggy / Zomato Clone
-- Includes Schema, Indexes, Seed Data, and Required Business Queries
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- 1. DROP EXISTING TABLES (FOR REPEATABLE EXECUTION)
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS stores;
DROP TABLE IF EXISTS users;

-- 2. CREATE TABLES
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stores (
    store_id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Closed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE menu_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    item_name VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
    category VARCHAR(50) NOT NULL,
    availability INTEGER DEFAULT 1 CHECK (availability IN (0, 1)),
    FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE CASCADE
);

CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (total_amount >= 0),
    order_status VARCHAR(30) DEFAULT 'Pending' CHECK (order_status IN ('Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled')),
    delivery_address TEXT NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refunded')),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE CASCADE
);

CREATE TABLE order_items (
    order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_order_time DECIMAL(10, 2) NOT NULL CHECK (price_at_order_time >= 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES menu_items(item_id) ON DELETE RESTRICT
);

-- 3. CREATE INDEXES
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_menu_items_store_id ON menu_items(store_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_item_id ON order_items(item_id);

-- 4. INSERT SAMPLE DATA
INSERT INTO users (user_id, name, email, phone, address, created_at) VALUES
(101, 'Rahul Sharma', 'rahul.sharma@example.com', '+91-9876543210', '123 MG Road, Indiranagar, Bengaluru', '2026-08-01 10:00:00'),
(102, 'Priya Patel', 'priya.patel@example.com', '+91-9876543211', '45 Park Street, Koramangala, Bengaluru', '2026-08-05 11:30:00'),
(103, 'Amit Kumar', 'amit.kumar@example.com', '+91-9876543212', '78 Ring Road, HSR Layout, Bengaluru', '2026-08-10 14:15:00'),
(104, 'Sneha Reddy', 'sneha.reddy@example.com', '+91-9876543213', '12 Jubilee Hills, Jayanagar, Bengaluru', '2026-08-15 09:45:00'),
(105, 'Vikram Singh', 'vikram.singh@example.com', '+91-9876543214', '89 Whitefield Main Rd, Bengaluru', '2026-08-20 16:20:00');

INSERT INTO stores (store_id, store_name, address, phone, status, created_at) VALUES
(1, 'Pizza Palace', '100 Feet Road, Indiranagar, Bengaluru', '+91-8012345678', 'Active', '2026-01-10 08:00:00'),
(2, 'Burger Hub', '5th Block, Koramangala, Bengaluru', '+91-8023456789', 'Active', '2026-01-15 08:00:00'),
(3, 'Spice Garden', '4th Block, Jayanagar, Bengaluru', '+91-8034567890', 'Active', '2026-02-01 08:00:00'),
(4, 'Sushi World', 'UB City, Vittal Mallya Rd, Bengaluru', '+91-8045678901', 'Active', '2026-02-20 08:00:00'),
(5, 'Taco Fiesta', 'Sector 1, HSR Layout, Bengaluru', '+91-8056789012', 'Active', '2026-03-05 08:00:00');

INSERT INTO menu_items (item_id, store_id, item_name, description, price, category, availability) VALUES
(201, 1, 'Pepperoni Pizza', 'Classic pepperoni with mozzarella cheese', 350.00, 'Mains', 1),
(202, 1, 'Margherita Pizza', 'Fresh basil, tomatoes & mozzarella', 250.00, 'Mains', 1),
(203, 1, 'Garlic Breadsticks', 'Warm breadsticks brushed with garlic butter', 120.00, 'Starters', 1),
(204, 1, 'Chocolate Lava Cake', 'Warm chocolate cake with gooey molten center', 90.00, 'Desserts', 1),
(205, 2, 'Classic Cheese Burger', 'Juicy beef patty with cheddar cheese & sauce', 200.00, 'Mains', 1),
(206, 2, 'Crispy Chicken Burger', 'Fried chicken fillet with fresh lettuce & mayo', 180.00, 'Mains', 1),
(207, 2, 'French Fries', 'Crispy salted golden potato fries', 90.00, 'Sides', 1),
(208, 2, 'Vanilla Milkshake', 'Thick creamy vanilla ice cream shake', 120.00, 'Beverages', 1),
(209, 3, 'Paneer Butter Masala', 'Cottage cheese in rich tomato butter gravy', 240.00, 'Mains', 1),
(210, 3, 'Butter Naan', 'Soft Indian flatbread brushed with butter', 40.00, 'Breads', 1),
(211, 3, 'Chicken Biryani', 'Aromatic basmati rice cooked with spiced chicken', 290.00, 'Mains', 1),
(212, 3, 'Gulab Jamun', 'Sweet fried dough balls soaked in sugar syrup', 50.00, 'Desserts', 1),
(213, 4, 'Salmon Roll', 'Fresh salmon roll with avocado & seasoned rice', 420.00, 'Mains', 1),
(214, 4, 'California Roll', 'Crab stick, cucumber & avocado sushi roll', 380.00, 'Mains', 1),
(215, 4, 'Miso Soup', 'Traditional Japanese soybean broth soup', 130.00, 'Soups', 1),
(216, 4, 'Green Tea Ice Cream', 'Refreshing matcha green tea flavored dessert', 160.00, 'Desserts', 1),
(217, 5, 'Cheesy Beef Taco', 'Hard shell taco stuffed with beef & cheese', 160.00, 'Mains', 1),
(218, 5, 'Veggie Burrito', 'Rice, black beans, salsa wrapped in tortilla', 210.00, 'Mains', 1),
(219, 5, 'Nachos Supreme', 'Tortilla chips topped with cheese sauce & jalapenos', 170.00, 'Snacks', 1),
(220, 5, 'Churros with Dip', 'Crispy fried dough pastry with chocolate dip', 130.00, 'Desserts', 1);

INSERT INTO orders (order_id, user_id, store_id, order_date, total_amount, order_status, delivery_address, payment_status) VALUES
(1001, 101, 1, '2026-09-01 12:30:00', 440.00, 'Delivered', '123 MG Road, Indiranagar, Bengaluru', 'Paid'),
(1002, 102, 2, '2026-09-01 13:15:00', 290.00, 'Delivered', '45 Park Street, Koramangala, Bengaluru', 'Paid'),
(1003, 103, 3, '2026-09-02 19:00:00', 370.00, 'Delivered', '78 Ring Road, HSR Layout, Bengaluru', 'Paid'),
(1004, 104, 4, '2026-09-02 20:30:00', 800.00, 'Delivered', '12 Jubilee Hills, Jayanagar, Bengaluru', 'Paid'),
(1005, 101, 2, '2026-09-03 14:00:00', 320.00, 'Delivered', '123 MG Road, Indiranagar, Bengaluru', 'Paid'),
(1006, 105, 5, '2026-09-03 18:45:00', 330.00, 'Delivered', '89 Whitefield Main Rd, Bengaluru', 'Paid'),
(1007, 102, 1, '2026-09-04 12:00:00', 600.00, 'Delivered', '45 Park Street, Koramangala, Bengaluru', 'Paid'),
(1008, 103, 2, '2026-09-04 13:30:00', 270.00, 'Out for Delivery', '78 Ring Road, HSR Layout, Bengaluru', 'Paid'),
(1009, 104, 5, '2026-09-05 19:15:00', 380.00, 'Preparing', '12 Jubilee Hills, Jayanagar, Bengaluru', 'Paid'),
(1010, 105, 3, '2026-09-05 20:00:00', 620.00, 'Delivered', '89 Whitefield Main Rd, Bengaluru', 'Paid'),
(1011, 101, 3, '2026-09-06 13:00:00', 330.00, 'Delivered', '123 MG Road, Indiranagar, Bengaluru', 'Paid'),
(1012, 101, 1, '2026-09-06 19:30:00', 560.00, 'Preparing', '123 MG Road, Indiranagar, Bengaluru', 'Paid'),
(1013, 102, 4, '2026-09-07 12:30:00', 550.00, 'Pending', '45 Park Street, Koramangala, Bengaluru', 'Pending'),
(1014, 103, 1, '2026-09-07 13:00:00', 600.00, 'Cancelled', '78 Ring Road, HSR Layout, Bengaluru', 'Refunded'),
(1015, 104, 3, '2026-09-07 13:30:00', 370.00, 'Preparing', '12 Jubilee Hills, Jayanagar, Bengaluru', 'Paid');

INSERT INTO order_items (order_item_id, order_id, item_id, quantity, price_at_order_time, subtotal) VALUES
(1, 1001, 201, 1, 350.00, 350.00),
(2, 1001, 204, 1, 90.00, 90.00),
(3, 1002, 205, 1, 200.00, 200.00),
(4, 1002, 207, 1, 90.00, 90.00),
(5, 1003, 209, 1, 240.00, 240.00),
(6, 1003, 210, 2, 40.00, 80.00),
(7, 1003, 212, 1, 50.00, 50.00),
(8, 1004, 213, 1, 420.00, 420.00),
(9, 1004, 214, 1, 380.00, 380.00),
(10, 1005, 205, 1, 200.00, 200.00),
(11, 1005, 208, 1, 120.00, 120.00),
(12, 1006, 217, 1, 160.00, 160.00),
(13, 1006, 219, 1, 170.00, 170.00),
(14, 1007, 201, 1, 350.00, 350.00),
(15, 1007, 202, 1, 250.00, 250.00),
(16, 1008, 206, 1, 180.00, 180.00),
(17, 1008, 207, 1, 90.00, 90.00),
(18, 1009, 218, 1, 210.00, 210.00),
(19, 1009, 219, 1, 170.00, 170.00),
(20, 1010, 211, 2, 290.00, 580.00),
(21, 1010, 210, 1, 40.00, 40.00),
(22, 1011, 211, 1, 290.00, 290.00),
(23, 1011, 210, 1, 40.00, 40.00),
(24, 1012, 201, 1, 350.00, 350.00),
(25, 1012, 203, 1, 120.00, 120.00),
(26, 1012, 204, 1, 90.00, 90.00),
(27, 1013, 213, 1, 420.00, 420.00),
(28, 1013, 215, 1, 130.00, 130.00),
(29, 1014, 201, 1, 350.00, 350.00),
(30, 1014, 202, 1, 250.00, 250.00),
(31, 1015, 209, 1, 240.00, 240.00),
(32, 1015, 210, 2, 40.00, 80.00),
(33, 1015, 212, 1, 50.00, 50.00);
