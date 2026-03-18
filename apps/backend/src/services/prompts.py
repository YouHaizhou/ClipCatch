# ============================================================
# Prompt 模板定义
# 只保留综合摘要模板
# ============================================================

PROMPTS: dict[str, dict] = {
    'summary': {
        'name': '综合摘要',
        'system': '你是一位专业的视频内容分析师，擅长将视频转写文本提炼为结构清晰、重点突出的 Markdown 笔记。'
                  '输出格式要求：使用 Markdown，包含概述段落、主要内容要点（使用 ## 二级标题分节）、关键词标签。'
                  '语言简洁专业，避免冗余重复。',
        'user_template': '以下是一段视频的语音转写文本，视频标题为「{title}」。\n\n'
                         '请生成一份结构化的 Markdown 笔记，包含：\n'
                         '1. 📋 **内容概述**（2-3句话）\n'
                         '2. 📌 **主要内容**（分节列出核心知识点）\n'
                         '3. 💡 **关键洞见**（3-5条最有价值的观点）\n'
                         '4. 🏷️ **关键词**（5-8个标签）\n\n'
                         '转写文本：\n{transcript}',
    },
    'timeline': {
        'name': '时间轴',
        'system': '你是一位专业的视频内容分析师，擅长将视频转写文本整理为清晰的时间轴格式。'
                  '输出格式要求：使用 Markdown，按时间顺序排列，每个时间段包含时间戳和对应内容摘要。'
                  '语言简洁，保持时间顺序的连贯性。',
        'user_template': '以下是一段视频的语音转写文本，视频标题为「{title}」。\n\n'
                         '请生成详细的时间轴笔记，按时间顺序列出每个段落的关键内容：\n'
                         '1. ⏱️ **时间轴概览**（整体结构）\n'
                         '2. 📍 **详细时间轴**（每个段落的时间点和内容）\n'
                         '3. 🔑 **关键节点**（最重要的时间点）\n\n'
                         '转写文本：\n{transcript}',
    },
    'meeting': {
        'name': '会议纪要',
        'system': '你是一位专业的会议记录员，擅长将会议或讲座内容整理为标准的会议纪要格式。'
                  '输出格式要求：使用 Markdown，包含议题、讨论要点、结论和待办事项。'
                  '语言正式，逻辑清晰，突出决议和行动项。',
        'user_template': '以下是一段视频/会议的语音转写文本，标题为「{title}」。\n\n'
                         '请整理为标准会议纪要格式，包含：\n'
                         '1. 📋 **会议概要**（主题、背景）\n'
                         '2. 💬 **议题与讨论**（各议题的讨论要点）\n'
                         '3. ✅ **结论与决议**\n'
                         '4. 📌 **待办事项**（行动项、负责方向、截止时间）\n\n'
                         '转写文本：\n{transcript}',
    },
    'keypoints': {
        'name': '关键知识点',
        'system': '你是一位专业的知识提炼专家，擅长从视频内容中提取核心知识点并结构化呈现。'
                  '输出格式要求：使用 Markdown，以结构化列表形式呈现，层次清晰，便于学习和复习。'
                  '每个知识点需有简洁的解释或说明。',
        'user_template': '以下是一段视频的语音转写文本，视频标题为「{title}」。\n\n'
                         '请从内容中提取关键知识点，以结构化形式呈现：\n'
                         '1. 🎯 **核心概念**（最重要的概念和定义）\n'
                         '2. 📚 **知识点列表**（分类整理的详细知识点）\n'
                         '3. 🔗 **知识关联**（各知识点之间的联系）\n'
                         '4. 💡 **实践要点**（可应用的实操建议）\n\n'
                         '转写文本：\n{transcript}',
    },
}


def build_messages(template_key: str, title: str, transcript: str) -> list[dict]:
    """
    构建 LLM messages 列表。
    transcript 超过 12000 字时自动截断（DeepSeek-chat 上下文 32K tokens）。
    """
    tpl = PROMPTS.get(template_key, PROMPTS['summary'])

    # 超长截断：保留前 12000 字 + 后 2000 字，中间加省略提示
    MAX_CHARS = 12000
    TAIL_CHARS = 2000
    if len(transcript) > MAX_CHARS + TAIL_CHARS:
        transcript = (
            transcript[:MAX_CHARS]
            + f'\n\n[...中间内容已省略，原文共 {len(transcript)} 字...]\n\n'
            + transcript[-TAIL_CHARS:]
        )

    user_content = tpl['user_template'].format(
        title=title,
        transcript=transcript,
    )

    return [
        {'role': 'system', 'content': tpl['system']},
        {'role': 'user',   'content': user_content},
    ]
