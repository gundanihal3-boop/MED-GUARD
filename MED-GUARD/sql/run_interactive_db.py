import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'food_delivery.db')

print("=" * 70)
print("  FOOD ORDERING DATABASE SYSTEM - INTERACTIVE QUERY TERMINAL")
print("=" * 70)
print(f"Connected to database: {db_path}\n")
print("Type any SQL query (e.g. SELECT * FROM users;) or type 'exit' to quit.\n")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

while True:
    try:
        user_query = input("SQL> ").strip()
        if not user_query:
            continue
        if user_query.lower() in ('exit', 'quit', 'q'):
            print("Exiting interactive terminal.")
            break
        
        cursor.execute(user_query)
        
        if user_query.lower().startswith("select") or "returning" in user_query.lower():
            results = cursor.fetchall()
            headers = [desc[0] for desc in cursor.description]
            print("\n" + " | ".join(headers))
            print("-" * (len(" | ".join(headers)) + 10))
            for row in results:
                print(" | ".join(str(val) for val in row))
            print(f"\n({len(results)} rows returned)\n")
        else:
            conn.commit()
            print(f"\nQuery executed successfully. ({cursor.rowcount} rows affected)\n")
            
    except Exception as e:
        print(f"\n[SQL Error]: {e}\n")

conn.close()
