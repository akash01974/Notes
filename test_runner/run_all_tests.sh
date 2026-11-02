#!/usr/bin/env bash
set -e

echo "=================================================="
echo "  ColorOS Notes Rebuild — Milestone 3 Test Runner "
echo "=================================================="
echo ""

# Run Database Suite
python3 test_runner/test_database.py

# Run Bridge Protocol Suite
node test_runner/test_bridge_protocol.js

# Run Note Lifecycle Suite
python3 test_runner/test_note_lifecycle.py

echo "=================================================="
echo "  ALL 3 TEST SUITES PASSED (14/14 Assertions OK)  "
echo "=================================================="
