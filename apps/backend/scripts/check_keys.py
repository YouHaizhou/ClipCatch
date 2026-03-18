import sys, json
sys.path.insert(0, r'g:\求职\项目\Resource-Seach-Summary\video-ai-desktop\backend')
from database import SessionLocal
from models import Setting

db = SessionLocal()
rows = db.query(Setting).filter(Setting.key.like('api_key%')).all()
if not rows:
    print('数据库中没有任何 api_key 记录')
for r in rows:
    if r.value and r.value not in ('null', '""', ''):
        try:
            val = json.loads(r.value)
            masked = str(val)[:6] + '***' if val else '空'
        except:
            masked = '解析失败'
        print(f'{r.key}: 已配置 ({masked})')
    else:
        print(f'{r.key}: 未配置')
db.close()
