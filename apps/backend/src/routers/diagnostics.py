# ============================================================
# 诊断路由 — 网络连通性检测
# ============================================================
from fastapi import APIRouter
from services.proxy_diagnostic_service import run_diagnostics

router = APIRouter()


@router.get('/diagnostics/network')
async def network_diagnostics():
    """执行网络诊断，返回各端点连通性状态及全局建议"""
    try:
        result = await run_diagnostics()
        return {'code': 0, 'data': result}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'code': 1, 'message': f'诊断失败: {e}'}
