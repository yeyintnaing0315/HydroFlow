import sqlite3

connection = sqlite3.connect(r"D:\Ai_Project\HydroFlow_V1\hydroflow.db")
rows = connection.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
).fetchall()
for (name,) in rows:
    count = connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
    print(f"{name}\t{count}")
