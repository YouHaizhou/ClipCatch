# Skill：数据库模型设计

## 触发时机
后端 Agent 需要新增或修改数据库表时调用此 Skill。

## 模型模板

```python
# src/models.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base

class NewModel(Base):
    """新模型说明"""
    __tablename__ = 'new_table'

    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String(200), nullable=False)
    content    = Column(Text)
    count      = Column(Integer, default=0)
    ratio      = Column(Float, default=0.0)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 外键关联
    parent_id  = Column(Integer, ForeignKey('parent_table.id'), nullable=False)
    parent     = relationship('ParentModel', back_populates='children')
```

## 字段类型选择规范

| 场景 | 类型 |
|------|------|
| 主键 | `Integer, primary_key=True, autoincrement=True` |
| 短字符串（<500字符）| `String(N)` |
| 长文本（内容、转写）| `Text` |
| URL、路径 | `String(1000)` |
| 状态标记 | `String(20)` |
| 百分比、进度 | `Float` |
| 字节数、计数 | `Integer` |
| 开关 | `Boolean, default=True/False` |
| 时间戳 | `DateTime, default=datetime.utcnow` |
| 配置值（KV存储）| `Text`（JSON 序列化） |

## 关联关系规范

```python
# 一对多（父表）
children = relationship('ChildModel', back_populates='parent', cascade='all, delete-orphan')

# 多对一（子表）
parent_id = Column(Integer, ForeignKey('parent_table.id'), nullable=False)
parent    = relationship('ParentModel', back_populates='children')
```

## 修改模型后操作

```bash
# 在 apps/backend/ 目录下重新初始化
python src/seed.py
```

## Setting 表使用规范（KV 存储）

```python
import json
from models import Setting

# 读取
row = db.query(Setting).filter(Setting.key == 'my_key').first()
value = json.loads(row.value) if row and row.value else None

# 写入
row = db.query(Setting).filter(Setting.key == 'my_key').first()
if row:
    row.value = json.dumps('new_value')
else:
    db.add(Setting(key='my_key', value=json.dumps('new_value')))
db.commit()
```

## 注意事项

- 修改模型后必须重启后端（SQLite create_all 不会修改已存在的列）
- 如需修改已存在的表结构，手动迁移或删除数据库文件重建
- 外键关联必须加 `cascade='all, delete-orphan'`
