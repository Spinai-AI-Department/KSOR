from __future__ import annotations

import asyncio
import json

from app.db.pool import db
from app.db.queries import execute


QUESTIONS = {
    "VAS": [
        ("vas_back", 1, "현재 허리/목 통증은 어느 정도입니까?", "SLIDER", None, 0, 10),
        ("vas_leg", 2, "현재 다리/팔 방사통은 어느 정도입니까?", "SLIDER", None, 0, 10),
    ],
    "ODI": [(f"odi_q{i}", i, f"ODI 문항 {i}", "BUTTON", [{"value": x, "label": str(x)} for x in range(6)], None, None) for i in range(1, 11)],
    "NDI": [(f"ndi_q{i}", i, f"NDI 문항 {i}", "BUTTON", [{"value": x, "label": str(x)} for x in range(6)], None, None) for i in range(1, 11)],
    "EQ5D5L": [(f"eq5d_q{i}", i, f"EQ-5D-5L 문항 {i}", "BUTTON", [{"value": x, "label": f"{x}단계"} for x in range(1, 6)], None, None) for i in range(1, 6)] + [("eq_vas", 6, "오늘 건강 상태를 0~100으로 표시해 주세요.", "SLIDER", None, 0, 100)],
    "FOLLOWUP": [
        ("fu_satisfaction", 1, "수술 결과에 얼마나 만족하십니까?", "BUTTON", [{"value": 5, "label": "매우 만족"}, {"value": 4, "label": "만족"}, {"value": 3, "label": "보통"}, {"value": 2, "label": "불만족"}, {"value": 1, "label": "매우 불만족"}], None, None),
        ("fu_global", 2, "전체적으로 증상이 얼마나 좋아졌습니까?", "BUTTON", [{"value": 5, "label": "매우 호전"}, {"value": 4, "label": "호전"}, {"value": 3, "label": "보통"}, {"value": 2, "label": "악화"}, {"value": 1, "label": "매우 악화"}], None, None),
        ("fu_return_work", 3, "일상 또는 업무에 복귀하셨습니까?", "BUTTON", [{"value": 1, "label": "예"}, {"value": 0, "label": "아니오"}], None, None),
    ],
}


async def main() -> None:
    await db.open()
    try:
        async with db.pool.connection() as conn:
            for instrument, items in QUESTIONS.items():
                for code, order, text, response_type, options, min_score, max_score in items:
                    await execute(
                        conn,
                        """
                        INSERT INTO ref.prom_question_bank (
                            question_bank_id, instrument_code, question_code, display_order,
                            question_text_ko, response_type, options_jsonb, min_score, max_score,
                            is_active, created_at
                        ) VALUES (
                            gen_random_uuid(), %s, %s, %s,
                            %s, %s, %s::jsonb, %s, %s,
                            true, now()
                        )
                        ON CONFLICT (instrument_code, question_code)
                        DO UPDATE SET
                            display_order = EXCLUDED.display_order,
                            question_text_ko = EXCLUDED.question_text_ko,
                            response_type = EXCLUDED.response_type,
                            options_jsonb = EXCLUDED.options_jsonb,
                            min_score = EXCLUDED.min_score,
                            max_score = EXCLUDED.max_score,
                            is_active = true
                        """,
                        (
                            instrument,
                            code,
                            order,
                            text,
                            response_type,
                            json.dumps(options, ensure_ascii=False) if options is not None else None,
                            min_score,
                            max_score,
                        ),
                    )
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
