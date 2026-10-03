"""Reference solutions for every mission, run through the real /api/run-flow endpoint."""
import copy
import json
import unittest
from unittest import mock

from backend import app as app_module


def flow(nodes, edges):
    """nodes: {alias: (type, config)}; edges: [(alias, alias)] in connection order."""
    return {
        "nodes": [{"id": a, "type": t, "config": c} for a, (t, c) in nodes.items()],
        "edges": [{"from": f, "to": t} for f, t in edges],
    }


def chain(*blocks):
    """Input -> block -> block ... -> Output, each block given as (type, config)."""
    nodes = {"in": ("Input", {})}
    edges, previous = [], "in"
    for i, block in enumerate(blocks):
        nodes[f"b{i}"] = block
        edges.append((previous, f"b{i}"))
        previous = f"b{i}"
    nodes["out"] = ("Output", {})
    edges.append((previous, "out"))
    return flow(nodes, edges)


SOLUTIONS = {
    "easy_1": chain(("Compare", {"op": ">=", "value": "18"})),
    "easy_2": flow(
        {"i": ("Input", {}), "w": ("Get", {"key": "weight"}), "h": ("Get", {"key": "height"}), "sq": ("Square", {}),
         "d": ("Divide", {}), "r": ("Round", {"decimals": 1}), "o": ("Output", {})},
        [("i", "w"), ("i", "h"), ("h", "sq"), ("w", "d"), ("sq", "d"), ("d", "r"), ("r", "o")]),
    "easy_3": flow(
        {"i": ("Input", {}), "r": ("Reverse", {}), "c": ("Compare", {"op": "=="}), "o": ("Output", {})},
        [("i", "r"), ("i", "c"), ("r", "c"), ("c", "o")]),
    "easy_4": chain(("Convert", {})),
    "easy_5": flow(
        {"i": ("Input", {}), "s": ("Sum", {}), "l": ("Length", {}), "d": ("Divide", {}), "o": ("Output", {})},
        [("i", "s"), ("i", "l"), ("s", "d"), ("l", "d"), ("d", "o")]),
    "medium_1": chain(("Midpoint", {}), ("BinaryCompare", {}), ("RepeatSearch", {})),
    "medium_2": chain(("Div4Check", {}), ("CenturyRule", {})),
    "medium_3": chain(("CompareSwap", {}), ("PassRepeat", {})),
    "hard_1": chain(("TotalSum", {}), ("Percentage", {}), ("PieChart", {"title": "Monthly Expense Pie Chart"})),
    "hard_2": chain(("TargetCompare", {}), ("BarChart", {"title": "Weekly Sales Bar Chart"})),
    "hard_3": chain(("GradeClassifier", {}), ("CountGrades", {}), ("PieChart", {"title": "Student Grade Distribution"})),
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
        # The test team "T" is not a registered participant; treat it as admin-activated.
        access = mock.patch.object(app_module, "_participant_access_denied", return_value=False)
        access.start()
        self.addCleanup(access.stop)
        # Independent of whatever the shared timer in the local data store is doing.
        lock = mock.patch.object(app_module, "_timed_lock_error", return_value=None)
        lock.start()
        self.addCleanup(lock.stop)

    def run_flow(self, mission_id, flow_json):
        res = self.client.post("/api/run-flow", json={"mission_id": mission_id, "flow": flow_json, "team_id": "T"})
        return res.get_json()

    def test_every_reference_solution_earns_full_credits(self):
        self.assertEqual(set(SOLUTIONS), set(MISSIONS))
        for mission_id, solution in SOLUTIONS.items():
            with self.subTest(mission=mission_id):
                body = self.run_flow(mission_id, with_input(mission_id, solution))
                self.assertTrue(body["success"], body)
                self.assertTrue(body["all_passed"], body)
                self.assertTrue(all(t["passed"] for t in body["test_results"]), body["test_results"])
                self.assertEqual(body["credits"], body["question_credits"])

    def test_question_set_matches_the_pdf(self):
        levels = {"easy": 5, "medium": 3, "hard": 3}
        for level, count in levels.items():
            self.assertEqual(sum(1 for m in MISSIONS.values() if m["difficulty"] == level), count)
        default = {"easy": 4, "medium": 10}
        self.assertEqual(sum(m.get("credits", default.get(m["difficulty"])) for m in MISSIONS.values()), 100)

    def test_expected_outputs_shown_to_participants(self):
        expected = {
            "easy_1": "True", "easy_2": "22.9", "easy_3": "True", "easy_4": "37.0", "easy_5": "25.0",
            "medium_1": "4", "medium_2": "True", "medium_3": "[11, 12, 22, 25, 64]",
        }
        for mission_id, text in expected.items():
            with self.subTest(mission=mission_id):
                self.assertEqual(str(self.run_flow(mission_id, with_input(mission_id, SOLUTIONS[mission_id]))["output"]), text)
                self.assertEqual(MISSIONS[mission_id]["expected_output"], text)

    def test_charts_return_an_image_and_their_data(self):
        for mission_id in ("hard_1", "hard_2", "hard_3"):
            with self.subTest(mission=mission_id):
                body = self.run_flow(mission_id, with_input(mission_id, SOLUTIONS[mission_id]))
                self.assertTrue(body["is_chart"])
                self.assertTrue(body["output"].startswith("data:image/png"))
                self.assertEqual(body["chart_summary"], MISSIONS[mission_id]["expected_output"])

    def test_divide_in_the_wrong_order_is_wrong(self):
        wrong = copy.deepcopy(with_input("easy_5", SOLUTIONS["easy_5"]))
        wrong["edges"][2], wrong["edges"][3] = wrong["edges"][3], wrong["edges"][2]  # Length -> Divide first
        self.assertFalse(self.run_flow("easy_5", wrong)["all_passed"])

    def test_wrong_mapping_still_earns_partial_credits(self):
        wrong = flow({"i": ("Input", {}), "o": ("Output", {})}, [("i", "o")])
        body = self.run_flow("easy_1", wrong)
        self.assertFalse(body["all_passed"])
        self.assertLess(body["credits"], body["question_credits"])

    def test_skipped_question_earns_nothing(self):
        for empty in ({"nodes": [], "edges": []},
                      {"nodes": [{"id": "i", "type": "Input", "config": {}}], "edges": []}):
            body = self.run_flow("easy_1", empty)
            self.assertEqual(body["credits"], 0)

    def test_missing_or_wrong_input_data_loses_credit(self):
        for mission_id in ("easy_1", "easy_4"):
            with self.subTest(mission=mission_id):
                empty = self.run_flow(mission_id, SOLUTIONS[mission_id])
                self.assertFalse(empty["all_passed"])
                wrong = copy.deepcopy(with_input(mission_id, SOLUTIONS[mission_id]))
                wrong["nodes"][0]["config"] = {"data": 999}
                body = self.run_flow(mission_id, wrong)
                self.assertFalse(body["all_passed"])

    def test_input_typed_as_text_is_accepted(self):
        typed = with_input("easy_1", SOLUTIONS["easy_1"])
        typed["nodes"][0]["config"] = {"data": "20"}
        self.assertTrue(self.run_flow("easy_1", typed)["all_passed"])


class TestNewBlocks(unittest.TestCase):
    def test_binary_search_edge_cases(self):
        from backend.modules.algo_modules import execute_midpoint, execute_binary_compare, execute_repeat_search

        def search(array, target):
            return execute_repeat_search(execute_binary_compare(execute_midpoint({"array": array, "target": target})))

        self.assertEqual(search([], 1), -1)
        self.assertEqual(search([5], 5), 0)
        self.assertEqual(search([1, 3, 5, 7], 7), 3)
        self.assertEqual(search([1, 3, 5, 7], 0), -1)

    def test_leap_years(self):
        from backend.modules.algo_modules import execute_div4_check, execute_century_rule
        leap = lambda y: execute_century_rule(execute_div4_check(y))
        self.assertEqual([leap(y) for y in (2000, 1900, 2024, 2023, 2100, 1600)], [True, False, True, False, False, True])

    def test_chart_blocks_reject_wrong_input(self):
        from backend.modules.chart_modules import execute_pie_chart, execute_bar_chart
        for block in (execute_pie_chart, execute_bar_chart):
            with self.assertRaises(ValueError):
                block([1, 2, 3])


if __name__ == "__main__":
    unittest.main()
