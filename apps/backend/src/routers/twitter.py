# ============================================================
# Twitter 账号管理路由
# POST /api/twitter/account        — 添加账号
# GET  /api/twitter/account/status — 查询状态
# DELETE /api/twitter/account      — 删除账号
# ============================================================
from fastapi import APIRouter
router = APIRouter()


@router.post('/twitter/account')
async def add_account(body: dict):
    """添加 Twitter 账号凭证并登录"""
    username = body.get('username', '').strip()
    password = body.get('password', '').strip()
    email = body.get('email', '').strip()
    email_password = body.get('email_password', '').strip()
    cookies = body.get('cookies', '').strip()

    if not username:
        return {'code': 1, 'message': '用户名为必填'}
    if not cookies and (not password or not email):
        return {'code': 1, 'message': '请填写 Cookie 或账号密码+邮箱'}

    try:
        from services.twitter_service import add_twitter_account
        result = await add_twitter_account(username, password, email, email_password, cookies)
        if result['success']:
            return {'code': 0, 'data': result}
        else:
            return {'code': 1, 'message': result['message']}
    except RuntimeError as e:
        return {'code': 1, 'message': str(e)}
    except Exception as e:
        return {'code': 1, 'message': f'操作失败: {e}'}


@router.get('/twitter/account/status')
async def account_status():
    """查询已配置的 Twitter 账号状态"""
    try:
        from services.twitter_service import get_twitter_account_status
        data = await get_twitter_account_status()
        return {'code': 0, 'data': data}
    except Exception as e:
        return {'code': 0, 'data': {'configured': False, 'accounts': [], 'error': str(e)}}


@router.delete('/twitter/account')
async def remove_account(body: dict):
    """删除指定 Twitter 账号"""
    username = body.get('username', '').strip()
    if not username:
        return {'code': 1, 'message': 'username 不能为空'}
    try:
        from services.twitter_service import remove_twitter_account
        result = await remove_twitter_account(username)
        if result['success']:
            return {'code': 0, 'data': result}
        else:
            return {'code': 1, 'message': result['message']}
    except Exception as e:
        return {'code': 1, 'message': str(e)}
