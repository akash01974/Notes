# REA Evidence Schema and Query Method

## Input and Envelope

- File: `apk-work/tiptap_rea_evidence.json` (198,597,377 bytes; single-line ASCII JSON).
- Top-level envelope: `artifacts`, `captures`, `environments`, `providers`, and `records`.
- One artifact is described as `format: "directory"`; provider is `rea-javascript-application`, version `1`.
- The first record includes authority/confidence, evidence IDs, locations, limitations, and `normalized_result`.
- `normalized_result` contains a JAG `graph` and separate `semantic_graph`. These are distinct layers and have distinct ID namespaces.

## Graph Representations

| Layer | Record shape | Identifiers / source references | Observed counts and limits |
|---|---|---|---|
| Application graph (JAG) | `graph.nodes[]`, `graph.edges[]`, `graph.coverage` | Nodes use `jag_node_*`; edges use `jag_edge_*`. Nodes have `kind`, optional `label`, `identity`, and one or more `observations`. Observations carry artifact hash, authority, confidence, extractor, limitations, and optional source location. | 615 nodes, 1,030 edges. Coverage is `partial`; it has explicit limits. |
| JavaScript semantic graph (JSRG) | `semantic_graph.nodes[]`, `semantic_graph.relations[]`, `semantic_graph.coverage` | Nodes use `jsrg_node_*`; relations use `jsrg_relation_*`; unknowns use `jsrg_unknown_*`; evidence uses `jsrg_evidence_*`. Nodes expose `kind`, `label`, `identity.module_path`, `identity.source_range`, `function_node_id`, `application_node_ids`, and `evidence.location.value`. Relation fields include `relation`, `source_node_id`, `target_node_id`, `resolution`, and evidence. | 100,000 nodes (at configured ceiling), 108,339 relations. `truncated: true`; overall coverage `partial`. |

### Source Locations and Evidence Meaning

[VERIFIED] Source ranges are represented as `kind: "source-range"`, `source`, and `start`/`end` line and column. For minified input, columns/offsets can be more actionable than lines. A sample JAG observation pointed to `assets/@vue.js` line 9 and had `authority: static-relationship-inference`, `confidence: low`, `state: inferred`, plus an explicit limitation that static syntax does not prove runtime execution. A sample semantic relation had `relation: "defines"`, `resolution: "resolved"`, and stable `jsrg_relation_*`/node IDs.

Confidence/authority and source range must be read together. A graph edge is evidence for the extracted relationship, not proof the code executes, is reachable, or enforces a security property. The record itself says graph coverage is incomplete and lists static imports, entrypoints, workers, endpoints, and storage relationships as non-runtime proof.

## Relation Families and Partiality

Task-supplied relation-family counts are 71,016 data-flow, 23,669 closure, 7,911 call-flow, and 5,520 object-flow. A streamed count of all semantic `relation_id` records returned 108,339 total relations; the families above are not the complete relation inventory. `semantic_graph.coverage` is partial and truncated at 100,000 semantic nodes. It records omitted unknown occurrences including 14,578 dynamic call-flow occurrences, 19,737 ambiguous-target object-flow occurrences, 535 dynamic-property object-flow occurrences, and 59 ambiguous-target timer occurrences. `max_semantic_nodes` is 100,000 and per-file ceilings are 20,000.

A streamed histogram confirmed the call-flow relation types and counts: `calls` 2,822, `argument-to-parameter` 1,127, and `returns-to-call` 3,962 (sum 7,911). Other observed relation values include `captures`, `reads`, `writes`, `reads-property`, `writes-property`, `aliases`, and `defines`; relation-family totals and relation-label histograms are different views and should not be conflated.

Targeted exact-label searches for `callInitContentFromJava`, `onContentJsonUpdate`, `callSetBoldFromJava`, `callToggleTaskListFromJava`, and `callGetAllHTMLFromJava` returned zero semantic graph nodes. This is a limitation of graph symbol representation/label coverage, not evidence that these source operations do not exist. Source correlation is therefore authoritative for these handlers; do not fabricate JSRG node IDs.

## Safe Query Method

Because the file is a single 198 MB line, inspect its prefix and use `jq --stream` for counting and schema discovery. `jq --stream` emits path/value pairs and avoids constructing the full document tree. Examples used during this investigation:

```sh
stat -c '%n %s bytes' apk-work/tiptap_rea_evidence.json
head -c 2500 apk-work/tiptap_rea_evidence.json

# Count node IDs in the JAG graph
jq --stream -r 'select((.[0]|length)==7 and .[0][0:5]==["records",0,"normalized_result","graph","nodes"] and .[0][6]=="node_id") | .[1]' \
  apk-work/tiptap_rea_evidence.json | wc -l

# Count semantic relation IDs
jq --stream -c 'select(.[0][0:5]==["records",0,"normalized_result","semantic_graph","relations"] and (.[0]|length)==7 and .[0][6]=="relation_id") | .[1]' \
  apk-work/tiptap_rea_evidence.json | wc -l

# Inspect fields from one node without retaining the graph
jq --stream -c 'select(.[0][0:6]==["records",0,"normalized_result","graph","nodes",0]) | [.[0][6:], .[1]]' \
  apk-work/tiptap_rea_evidence.json | sed -n '1,90p'
```

The existing `apk-work/rea-tools/query_evidence.py` and `semantic_query.py` call `json.load()` on the entire document. They are unsuitable as default entry points for memory-constrained targeted investigation. No new query utility was added because `jq --stream` sufficed for this round.

To isolate call-flow relation labels without materializing the graph:

```sh
jq --stream -r '
  select(.[0][0:5] == ["records",0,"normalized_result","semantic_graph","relations"]
    and .[0][-1] == "relation"
    and (.[1] == "calls" or .[1] == "argument-to-parameter" or .[1] == "returns-to-call"))
  | [.[0][5], .[1]] | @tsv
' apk-work/tiptap_rea_evidence.json
```

For a path query, retain only the selected relation records’ `relation_id`, `source_node_id`, `target_node_id`, and `resolution`, then join those endpoint IDs against a separately indexed subset of `semantic_graph.nodes[]` (`node_id`, `label`, `kind`, `identity.module_path`, and `evidence.location`). A streaming pass can emit these small records to SQLite or sorted temporary files. A direct label search found no semantic nodes for the editor bridge names tested here, so no handler-specific call path could be truthfully reported from JSRG. Static relation traversal can establish candidate graph paths only; dynamic calls and ambiguous relations remain unresolved and runtime reachability is not proven.

## Investigation Workflow

1. Read the JSON prefix and file size before parsing.
2. Stream paths to identify schema and count records by stable ID fields.
3. Query graph coverage/limits before interpreting missing nodes or edges.
4. Use REA source paths/ranges to locate exact source and independently verify in `assets/tiptap/` or JADX output.
5. Record the REA ID only when the exact node/relation is matched to the source range. Otherwise cite source path/line/offset and say no graph ID was mapped.
6. Treat dynamic/ambiguous relations, unresolved references, and partial/truncated coverage as explicit unknowns.