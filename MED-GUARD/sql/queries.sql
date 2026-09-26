-- ==============================================================================
-- REQUIRED SQL QUERIES & BUSINESS TRANSACTIONS
-- Food Ordering Database System (Swiggy / Zomato Clone)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- QUERY 3: Display all users
-- ------------------------------------------------------------------------------
SELECT user_id, name, email, phone, address, created_at
FROM users;

-- ------------------------------------------------------------------------------
-- QUERY 4: Display all restaurants / stores
-- ------------------------------------------------------------------------------
SELECT store_id, store_name, address, phone, status, created_at
FROM stores;

-- ------------------------------------------------------------------------------
-- QUERY 5: Display a restaurant's menu (e.g., Pizza Palace, store_id = 1)
-- ------------------------------------------------------------------------------
SELECT item_id, item_name, description, price, category, availability
FROM menu_items
WHERE store_id = 1;

-- ------------------------------------------------------------------------------
-- QUERY 6: Create / Place an initial order skeleton (e.g., user_id 101 at store_id 1)
-- ------------------------------------------------------------------------------
INSERT INTO orders (user_id, store_id, order_date, total_amount, order_status, delivery_address, payment_status)
VALUES (101, 1, CURRENT_TIMESTAMP, 0.00, 'Pending', '123 MG Road, Indiranagar, Bengaluru', 'Pending');

-- ------------------------------------------------------------------------------
-- QUERY 7: Add items to the newly placed order (e.g., order_id = 1016)
-- ------------------------------------------------------------------------------
INSERT INTO order_items (order_id, item_id, quantity, price_at_order_time, subtotal)
VALUES 
    (1016, 201, 2, 350.00, 700.00), -- 2x Pepperoni Pizza
    (1016, 203, 1, 120.00, 120.00); -- 1x Garlic Breadsticks

-- ------------------------------------------------------------------------------
-- QUERY 8: Calculate & Update order total amount based on line subtotals
-- ------------------------------------------------------------------------------
UPDATE orders
SET total_amount = (
    SELECT COALESCE(SUM(subtotal), 0.00)
    FROM order_items
    WHERE order_id = 1016
)
WHERE order_id = 1016;

-- ------------------------------------------------------------------------------
-- QUERY 9: Display ALL orders belonging to a given user_id (CRITICAL REQUIREMENT)
-- Returns: order_id, user_id, store_name, order_date, total_amount, order_status, payment_status, delivery_address
-- ------------------------------------------------------------------------------
SELECT 
    o.order_id,
    o.user_id,
    s.store_name,
    o.order_date,
    o.total_amount,
    o.order_status,
    o.payment_status,
    o.delivery_address
FROM orders o
JOIN stores s ON o.store_id = s.store_id
WHERE o.user_id = 101
ORDER BY o.order_date ASC;

-- ------------------------------------------------------------------------------
-- QUERY 10: Display complete details of a particular order (CRITICAL REQUIREMENT)
-- Returns: order info, user info, store name, food item names, quantity, price, subtotal
-- ------------------------------------------------------------------------------
SELECT 
    o.order_id,
    o.order_date,
    u.name AS customer_name,
    u.phone AS customer_phone,
    s.store_name,
    o.order_status,
    o.payment_status,
    o.delivery_address,
    mi.item_name,
    oi.quantity,
    oi.price_at_order_time,
    oi.subtotal,
    o.total_amount AS grand_total
FROM orders o
JOIN users u ON o.user_id = u.user_id
JOIN stores s ON o.store_id = s.store_id
JOIN order_items oi ON o.order_id = oi.order_id
JOIN menu_items mi ON oi.item_id = mi.item_id
WHERE o.order_id = 1012;

-- ------------------------------------------------------------------------------
-- QUERY 11: Display a user's total amount spent (completed / paid orders)
-- ------------------------------------------------------------------------------
SELECT 
    u.user_id,
    u.name,
    COALESCE(SUM(o.total_amount), 0.00) AS total_spent
FROM users u
LEFT JOIN orders o ON u.user_id = o.user_id AND o.payment_status = 'Paid'
WHERE u.user_id = 101
GROUP BY u.user_id, u.name;

-- ------------------------------------------------------------------------------
-- QUERY 12: Display a user's most recent order
-- ------------------------------------------------------------------------------
SELECT 
    o.order_id,
    o.user_id,
    s.store_name,
    o.order_date,
    o.total_amount,
    o.order_status,
    o.payment_status
FROM orders o
JOIN stores s ON o.store_id = s.store_id
WHERE o.user_id = 101
ORDER BY o.order_date DESC
LIMIT 1;

-- ------------------------------------------------------------------------------
-- QUERY 13: Display orders filtered by status (e.g., 'Delivered')
-- ------------------------------------------------------------------------------
SELECT 
    o.order_id,
    u.name AS customer_name,
    s.store_name,
    o.order_date,
    o.total_amount,
    o.order_status,
    o.payment_status
FROM orders o
JOIN users u ON o.user_id = u.user_id
JOIN stores s ON o.store_id = s.store_id
WHERE o.order_status = 'Delivered'
ORDER BY o.order_date DESC;

-- ------------------------------------------------------------------------------
-- QUERY 14: Display the most frequently ordered food items
-- ------------------------------------------------------------------------------
SELECT 
    mi.item_id,
    mi.item_name,
    s.store_name,
    SUM(oi.quantity) AS total_quantity_ordered,
    COUNT(DISTINCT oi.order_id) AS times_ordered
FROM order_items oi
JOIN menu_items mi ON oi.item_id = mi.item_id
JOIN stores s ON mi.store_id = s.store_id
GROUP BY mi.item_id, mi.item_name, s.store_name
ORDER BY total_quantity_ordered DESC
LIMIT 5;

-- ------------------------------------------------------------------------------
-- QUERY 15: Display the restaurants from which a specific user has ordered
-- ------------------------------------------------------------------------------
SELECT DISTINCT 
    s.store_id,
    s.store_name,
    s.address,
    s.phone
FROM stores s
JOIN orders o ON s.store_id = o.store_id
WHERE o.user_id = 101;
