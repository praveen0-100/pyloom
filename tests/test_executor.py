import unittest
from backend.engine.executor import execute_flow

class TestExecutor(unittest.TestCase):
    def test_average_calculation_flow(self):
        flow = {
            "nodes": [
                {"id": "n1", "type": "Input", "config": {"data": [85, 72, 91, 68, 79]}},
                {"id": "n2", "type": "Average", "config": {}},
                {"id": "n3", "type": "Output", "config": {"format": "Average: {value}"}}
            ],
            "edges": [
                {"from": "n1", "to": "n2"},
                {"from": "n2", "to": "n3"}
            ]
        }
        success, res = execute_flow(flow)
        self.assertTrue(success)
        self.assertEqual(res, "Average: 79.0")

    def test_string_formatting_flow(self):
        flow = {
            "nodes": [
                {"id": "n1", "type": "Input", "config": {"data": "python flow"}},
                {"id": "n2", "type": "Uppercase", "config": {}},
                {"id": "n3", "type": "Replace", "config": {"find": " ", "replace_with": "-"}},
                {"id": "n4", "type": "Output", "config": {}}
            ],
            "edges": [
                {"from": "n1", "to": "n2"},
                {"from": "n2", "to": "n3"},
                {"from": "n3", "to": "n4"}
            ]
        }
        success, res = execute_flow(flow)
        self.assertTrue(success)
        self.assertEqual(res, "PYTHON-FLOW")

if __name__ == "__main__":
    unittest.main()
