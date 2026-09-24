"""Reference solutions for every mission, run through the real /api/run-flow endpoint."""
import copy
import json
import unittest
from unittest import mock

from backend import app as app_module

FMT_LOCKER = "Student A locker = {value[student_b_locker]}\\nStudent B locker = {value[student_a_locker]}"
FMT_LANDMARK = "Country: {value[country]} | Continent: {value[continent]} | Hemisphere: {value[hemisphere]}"


def flow(nodes, edges):
    """nodes: {alias: (type, config)}; edges: [(alias, alias)] in connection order."""
    return {
        "nodes": [{"id": a, "type": t, "config": c} for a, (t, c) in nodes.items()],
        "edges": [{"from": f, "to": t} for f, t in edges],
    }


SOLUTIONS = {
    "mission_01": flow(
        {"i": ("Input", {}), "s": ("Subtract", {"operand": 100}), "m": ("Multiply", {"operand": 1.18}),
         "r": ("Round", {}), "o": ("Output", {})},
        [("i", "s"), ("s", "m"), ("m", "r"), ("r", "o")]),
    "mission_02": flow(
        {"i": ("Input", {}), "r": ("Reverse", {}), "c": ("Compare", {"op": "=="}), "o": ("Output", {})},
        [("i", "r"), ("i", "c"), ("r", "c"), ("c", "o")]),
    "mission_06": flow(
        {"i": ("Input", {}), "m": ("Multiply", {"operand": 1.1}), "d": ("Divide", {"operand": 4}),
         "r": ("Round", {}), "o": ("Output", {})},
        [("i", "m"), ("m", "d"), ("d", "r"), ("r", "o")]),
    "mission_07": flow(
        {"i": ("Input", {}), "r": ("Replace", {"find": " ", "replace_with": ""}), "u": ("Uppercase", {}),
         "o": ("Output", {"format": "#{value}"})},
        [("i", "r"), ("r", "u"), ("u", "o")]),
    "mission_08": flow(
        {"i": ("Input", {}), "s": ("Subtract", {"operand": 32}), "m": ("Multiply", {"operand": 5}),
         "d": ("Divide", {"operand": 9}), "c": ("Compare", {"op": ">", "value": "40"}), "o": ("Output", {})},
        [("i", "s"), ("s", "m"), ("m", "d"), ("d", "c"), ("c", "o")]),
    "mission_03": flow(
        {"i": ("Input", {}), "o": ("Output", {"format": FMT_LOCKER})},
        [("i", "o")]),
    "mission_04": flow(
        {"i": ("Input", {}), "g1": ("Get", {"key": "extra_hours"}), "m1": ("Multiply", {"operand": 25}),
         "g2": ("Get", {"key": "rating_score"}),
         "e": ("IfElse", {"op": ">=", "value": "4.5", "then": "2", "otherwise": "1"}),
         "m2": ("Multiply", {}), "a": ("Add", {"operand": 100}), "o": ("Output", {})},
        [("i", "g1"), ("g1", "m1"), ("i", "g2"), ("g2", "e"), ("m1", "m2"), ("e", "m2"), ("m2", "a"), ("a", "o")]),
    "mission_09": flow(
        {"i": ("Input", {}), "g1": ("Get", {"key": "notebook,pen,pencil_box"}), "s": ("Sum", {}),
         "g2": ("Get", {"key": "budget"}), "d": ("Subtract", {}),
         "o": ("Output", {"format": "Budget exceeded by {value}"})},
        [("i", "g1"), ("g1", "s"), ("i", "g2"), ("s", "d"), ("g2", "d"), ("d", "o")]),
    "mission_05": flow(
        {"i": ("Input", {}), "l": ("Lookup", {}), "h": ("Hemisphere", {}), "o": ("Output", {"format": FMT_LANDMARK})},
        [("i", "l"), ("l", "h"), ("h", "o")]),
    "mission_10": flow(
        {"i": ("Input", {}),
         "c": ("LineChart", {"title": "Weekly Attendance", "x_label": "Day", "y_label": "Students Present"}),
         "o": ("Output", {})},
        [("i", "c"), ("c", "o")]),
}


MISSIONS = {m["id"]: m for m in json.load(open(app_module.os.path.join(app_module.DATA_DIR, "missions.json"), encoding="utf8"))}


def with_input(mission_id, solution):
    """The participant types the question's input data into the Input node."""
    filled = copy.deepcopy(solution)
    for node in filled["nodes"]:
        if node["type"] == "Input":
            node["config"] = {"data": MISSIONS[mission_id]["input"]}
    return filled


class TestReferenceSolutions(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()
        patcher = mock.patch.object(app_module, "record_progress", return_value={})
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_flow(self, mission_id, flow_json):
        res = self.client.post("/api/run-flow", json={"mission_id": mission_id, "flow": flow_json, "team_id": "T"})
        return res.get_json()

    def test_every_reference_solution_earns_full_credits(self):
        for mission_id, solution in SOLUTIONS.items():
            with self.subTest(mission=mission_id):
                body = self.run_flow(mission_id, with_input(mission_id, solution))
                self.assertTrue(body["success"], body)
                self.assertTrue(body["all_passed"], body)
                self.assertEqual(body["credits"], body["question_credits"])

    def test_expected_outputs_shown_to_participants(self):
        expected = {
            "mission_01": "1652.0", "mission_02": "True", "mission_06": "550.0", "mission_07": "#PYTHONCODING",
            "mission_08": "True", "mission_04": "600.0", "mission_09": "Budget exceeded by 10",
        }
        for mission_id, text in expected.items():
            with self.subTest(mission=mission_id):
                self.assertEqual(str(self.run_flow(mission_id, with_input(mission_id, SOLUTIONS[mission_id]))["output"]), text)

    def test_wrong_mapping_still_earns_half_credits(self):
        wrong = flow({"i": ("Input", {}), "o": ("Output", {})}, [("i", "o")])
        body = self.run_flow("mission_01", wrong)
        self.assertFalse(body["all_passed"])
        self.assertEqual(body["credits"], body["question_credits"] / 2)

    def test_skipped_question_earns_nothing(self):
        for empty in ({"nodes": [], "edges": []},
                      {"nodes": [{"id": "i", "type": "Input", "config": {}}], "edges": []}):
            body = self.run_flow("mission_01", empty)
            self.assertEqual(body["credits"], 0)

    def test_missing_or_wrong_input_data_loses_credit(self):
        for mission_id in ("mission_01", "mission_07"):
            with self.subTest(mission=mission_id):
                empty = self.run_flow(mission_id, SOLUTIONS[mission_id])
                self.assertFalse(empty["all_passed"])
                self.assertLess(empty["credits"], empty["question_credits"])
                wrong = copy.deepcopy(with_input(mission_id, SOLUTIONS[mission_id]))
                wrong["nodes"][0]["config"] = {"data": 999}
                body = self.run_flow(mission_id, wrong)
                self.assertFalse(body["all_passed"])
                self.assertLess(body["credits"], body["question_credits"])

    def test_input_typed_as_text_is_accepted(self):
        typed = with_input("mission_01", SOLUTIONS["mission_01"])
        typed["nodes"][0]["config"] = {"data": "1500"}
        self.assertTrue(self.run_flow("mission_01", typed)["all_passed"])

    def test_chart_title_is_checked(self):
        untitled = with_input("mission_10", SOLUTIONS["mission_10"])
        untitled["nodes"] = [dict(n, config={}) if n["type"] == "LineChart" else n for n in untitled["nodes"]]
        body = self.run_flow("mission_10", untitled)
        self.assertLess(body["credits"], body["question_credits"])


if __name__ == "__main__":
    unittest.main()
