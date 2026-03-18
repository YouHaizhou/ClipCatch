import sys, json
sys.path.insert(0, r'g:\求职\项目\Resource-Seach-Summary\video-ai-desktop\backend')
from database import SessionLocal
from models import Setting

# 从命令行参数读取：python set_key.py deepseek sk-xxx
key_name = sys.argv[1]   # 如：api_key_deepseek
key_value = sys.argv[2]  # 如：sk-xxxxxxxx

db = SessionLocal()
row = db.query(Setting).filter(Setting.key == key_name).first()
if row:
    row.value = json.dumps(key_value)
else:
    db.add(Setting(key=key_name, value=json.dumps(key_value)))
db.commit()
db.close()
print(f'已保存 {key_name}')
