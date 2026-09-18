import unittest
from backend.engine.validator import validate_flow

class TestValidator(unittest.TestCase):
    def test_empty_flow(self):
        valid, err = validate_flow({"nodes": [], "edges": []})
        self.assertFalse(valid)
        self.assertEqual(err["type"], "EMPTY_GRAPH")

    def test_missing_input(self):
        flow = {
            "nodes": [{"id": "n1", "type": "Output"}],
            "edges": []
        }
        valid, err = validate_flow(flow)
        self.assertFalse(valid)
        self.assertEqual(err["type"], "MISSING_INPUT")

    def test_missing_output(self):
        flow = {
            "nodes": [{"id": "n1", "type": "Input"}],
            "edges": []
        }
        valid, err = validate_flow(flow)
        self.assertFalse(valid)
        self.assertEqual(err["type"], "MISSING_OUTPUT")

    def test_valid_flow(self):
        flow = {
            "nodes": [
                {"id": "n1", "type": "Input"},
                {"id": "n2", "type": "Output"}
            ],
            "edges": [{"from": "n1", "to": "n2"}]
        }
        valid, err = validate_flow(flow)
        self.assertTrue(valid)
        self.assertIsNone(err)

if __name__ == "__main__":
    unittest.main()
