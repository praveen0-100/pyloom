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

    def test_checks_score(self):
        from backend.engine.scorer import checks_score
        self.assertEqual([checks_score(n, 4) for n in (4, 3, 2, 1, 0)], [4, 3, 2, 1, 0])
        self.assertEqual([checks_score(n, 10) for n in (4, 3, 2, 1, 0)], [10, 8, 5, 3, 0])
        self.assertEqual([checks_score(n, 17) for n in (4, 3, 2, 1, 0)], [17, 13, 9, 4, 0])

    def test_score_follows_number_of_passing_checks(self):
        flow = {"nodes": [{"id": "a", "type": "Input", "config": {"data": 1}}, {"id": "b", "type": "Output"}], "edges": [{"from": "a", "to": "b"}]}
        mission = {"difficulty": "medium", "required_modules": ["Input", "Output"], "input": 1, "expected_output": "1"}
        full = score_flow(flow, mission, [], graph_valid=True, base_output="1")
        self.assertEqual((full["breakdown"]["checks_passed"], full["total_credits"]), (4, 10))
        wrong_output = score_flow(flow, mission, [], graph_valid=True, base_output="2")
        self.assertEqual((wrong_output["breakdown"]["checks_passed"], wrong_output["total_credits"]), (2, 5))
        invalid = score_flow(flow, mission, [], graph_valid=False, base_output=None)
        self.assertEqual((invalid["breakdown"]["checks_passed"], invalid["total_credits"]), (1, 3))

    def test_level_scores_total_100(self):
        from backend.engine.scorer import LEVEL_SCORE, TOTAL_SCORE
        self.assertEqual(LEVEL_SCORE, {"easy": 20, "medium": 30, "hard": 50})
        self.assertEqual(TOTAL_SCORE, 100)

    def test_medium_and_hard_full_score(self):
        flow = {"nodes": [{"id": "a", "type": "Input"}, {"id": "b", "type": "Output"}], "edges": [{"from": "a", "to": "b"}]}
        for level, full in (("medium", 10), ("hard", 17)):
            res = score_flow(flow, {"difficulty": level}, [{"passed": True}], graph_valid=True, base_output=None)
            self.assertEqual(res["question_credits"], full)
            self.assertEqual(res["total_credits"], 0 if not res["all_passed"] else full)
        res = score_flow(flow, {"difficulty": "hard", "expected_output": "x"}, [{"passed": True}], graph_valid=True, base_output="x")
        self.assertEqual(res["total_credits"], 17)
        res = score_flow(flow, {"difficulty": "hard", "credits": 16, "expected_output": "x"}, [{"passed": True}], graph_valid=True, base_output="x")
        self.assertEqual(res["total_credits"], 16)


if __name__ == "__main__":
    unittest.main()
