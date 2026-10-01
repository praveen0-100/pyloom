import unittest
from backend.engine.scorer import score_flow

class TestScorer(unittest.TestCase):
    def test_round1_scoring(self):
        mission = {
            "round": 1,
            "required_modules": ["Input", "Average", "Output"]
        }
        flow = {
            "nodes": [
                {"id": "n1", "type": "Input"},
                {"id": "n2", "type": "Average"},
                {"id": "n3", "type": "Output"}
            ],
            "edges": [{"from": "n1", "to": "n2"}, {"from": "n2", "to": "n3"}]
        }
        test_results = [
            {"passed": True},
            {"passed": True}
        ]
        res = score_flow(flow, mission, test_results, graph_valid=True)
        self.assertEqual(res["total_credits"], 4)  # all test cases pass

    def test_test_case_score(self):
        from backend.engine.scorer import test_case_score
        p, f = {"passed": True}, {"passed": False}
        self.assertEqual(test_case_score([p, p, p]), 4)
        self.assertEqual(test_case_score([p, p, f]), 3)
        self.assertEqual(test_case_score([p, f, f]), 1)
        self.assertEqual(test_case_score([f, f]), 0)
        self.assertEqual(test_case_score([]), 0)

    def test_level_scores_total_100(self):
        from backend.engine.scorer import LEVEL_SCORE, TOTAL_SCORE, test_case_score, QUESTION_CREDITS
        self.assertEqual(LEVEL_SCORE, {"easy": 20, "medium": 30, "hard": 50})
        self.assertEqual(TOTAL_SCORE, 100)
        p, f = {"passed": True}, {"passed": False}
        for level, full in QUESTION_CREDITS.items():
            self.assertEqual(test_case_score([p, p, p], full), full)
            self.assertEqual(test_case_score([f, f], full), 0)
            self.assertLess(test_case_score([p, f, f], full), test_case_score([p, p, f], full))
        self.assertEqual([test_case_score([p, p, f], q) for q in (4, 10, 25)], [3, 8, 19])

    def test_medium_and_hard_full_score(self):
        flow = {"nodes": [{"id": "a", "type": "Input"}, {"id": "b", "type": "Output"}], "edges": [{"from": "a", "to": "b"}]}
        for level, full in (("medium", 10), ("hard", 25)):
            res = score_flow(flow, {"difficulty": level}, [{"passed": True}], graph_valid=True, base_output=None)
            self.assertEqual(res["question_credits"], full)
            self.assertEqual(res["total_credits"], 0 if not res["all_passed"] else full)
        res = score_flow(flow, {"difficulty": "hard", "expected_output": "x"}, [{"passed": True}], graph_valid=True, base_output="x")
        self.assertEqual(res["total_credits"], 25)


if __name__ == "__main__":
    unittest.main()
