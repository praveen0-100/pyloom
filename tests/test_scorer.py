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
        self.assertEqual(res["total_credits"], 50)

if __name__ == "__main__":
    unittest.main()
