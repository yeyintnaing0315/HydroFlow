import sqlite3

connection = sqlite3.connect("../hydroflow.db")
print(connection.execute("SELECT name FROM sqlite_master WHERE name = 'historical_days'").fetchall())
print(connection.execute("SELECT version_num FROM alembic_version").fetchall())
