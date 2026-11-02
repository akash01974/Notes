# Technology Decision Matrix — Cross-Platform ColorOS Notes Replica

| Field | Value |
|---|---|
| **Status** | EVALUATION MATRIX — Phase 1 Milestone 2 |
| **Date** | 2026-11-02 |
| **Objective** | Quantitative multi-criteria decision analysis (MCDA) across core architectural tiers |
| **Scoring Scale** | 1 (Unacceptable / High Risk) to 5 (Exemplary / Optimal Fit) |
| **Policy** | Objective evidence-based scoring. **No scaffolding or implementation code.** |

---

## 1. Candidate Application Architecture Scoring Matrix

### Criteria & Weight Justification
1. **ColorOS UI & Physics Fidelity (Weight: 20%)**: Paramount project requirement. The app must replicate authentic ColorOS bouncy spring physics, staggered masonry grids, card transitions, and font scaling without looking generic.
2. **Editor Preservation & Bridge Reliability (Weight: 20%)**: Reusing the extracted TipTap bundle requires a robust webview container with high-throughput, low-latency bidirectional bridge communication (188 handlers / 107 methods).
3. **Cross-Platform OS Uniformity (Weight: 15%)**: Must run seamlessly on non-OPPO Android phones, Linux (Arch/Wayland/Hyprland), Windows 10/11, and macOS.
4. **Local Database & Storage Reliability (Weight: 15%)**: Must faithfully host and query the Room v47 14-table schema with transactional integrity and WAL concurrency.
5. **Runtime Performance & Memory Efficiency (Weight: 10%)**: Must maintain 60–120 FPS on mobile and consume reasonable RAM on desktop (<100 MB).
6. **Development Velocity & Maintainability (Weight: 10%)**: Cohesive tooling, typed ecosystem, and ease of debugging.
7. **Packaging & Deployment Simplicity (Weight: 10%)**: Single-command distribution of native APKs, Linux packages, Windows installers, and macOS bundles.

### Architecture Comparison Scorecard

| Evaluation Criterion | Weight | Candidate A: Vue 3 + Capacitor / Tauri | Candidate B: Flutter + TipTap WebView | Candidate C: Compose Multiplatform | Candidate D: React Native + Electron |
|---|:---:|:---:|:---:|:---:|:---:|
| **1. UI & Physics Fidelity** | 20% | 3.5 / 5 (CSS spring physics; web scrolling stutters on budget Android) | **4.8 / 5** (GPU-rendered Impeller/Skia; flawless 120 FPS COUI physics) | 4.6 / 5 (Native Android UI; Compose canvas on desktop) | 3.8 / 5 (React Native animated API; JS bridge frame drops) |
| **2. Editor Preservation** | 20% | **4.9 / 5** (Direct DOM integration; zero-bridge serialization) | 4.5 / 5 (Proven 15/15 PASS bundle in isolated webview; solid bridge) | 4.2 / 5 (Original webview on Android; desktop webview is fragile) | 3.5 / 5 (Two divergent webview plugins: RN mobile vs Electron) |
| **3. Cross-Platform Uniformity**| 15% | 3.6 / 5 (Tauri Linux Wayland/IME bugs; split Capacitor mobile) | **4.4 / 5** (Uniform Dart codebase; mature desktop targets) | 3.2 / 5 (Desktop webview is missing or requires 150MB CEF) | 2.5 / 5 (RN desktop is fragmented and unmaintained on Linux) |
| **4. Database & Storage** | 15% | 3.2 / 5 (Split SQLite plugins: Rust `rusqlite` vs Capacitor SQLite) | **4.8 / 5** (Unified `drift` / `sqlite3` C-bindings across all 4 OS targets) | 4.6 / 5 (Room KMP / SQLDelight provides unified Kotlin SQLite) | 3.4 / 5 (Split: `op-sqlite` on Android vs `better-sqlite3` on Electron) |
| **5. Runtime Performance** | 10% | 3.8 / 5 (Tauri is very light on desktop; Capacitor is heavy on Android) | **4.6 / 5** (Fast AOT compiled binary; ~60-80MB RAM; 120 FPS) | 3.5 / 5 (JVM/Skiko overhead on desktop >150MB RAM) | 2.0 / 5 (Electron memory bloat >250MB; heavy battery drain) |
| **6. Dev Velocity & Maint.** | 10% | **4.6 / 5** (Single TypeScript / Vue 3 language across app & editor) | 4.2 / 5 (Cohesive Dart ecosystem; well-documented plugins) | 3.0 / 5 (Triple-stack complexity: Kotlin + desktop CEF + JS) | 2.6 / 5 (Constant React version churn and broken native modules) |
| **7. Packaging & Distribution**| 10% | 4.2 / 5 (Tauri outputs small `.deb`/`.appimage`; standard APK) | **4.7 / 5** (Official CLI outputs native APK, Linux tar/deb, MSIX, DMG) | 3.5 / 5 (Requires Conveyor / `jpackage` bundling heavy JRE) | 3.0 / 5 (Electron outputs large ~90MB installers) |
| **WEIGHTED TOTAL SCORE** | **100%** | **3.94 / 5.00** | **4.61 / 5.00** | **3.89 / 5.00** | **3.03 / 5.00** |

#### Matrix Verdict:
- **Winner: Candidate B (Flutter Shell + TipTap WebView)** with **4.61 / 5.00**.
- **Runner-up: Candidate A (Vue 3 + Capacitor / Tauri)** with **3.94 / 5.00**.
- **Rejected: Candidate C (3.89)** due to desktop webview fragmentation and heavy JRE distribution.
- **Rejected: Candidate D (3.03)** due to divergent codebases, Electron bloat, and poor Linux desktop support.

---

## 2. Editor Strategy Scoring Matrix

| Strategy | Behavioral Fidelity | Development Effort | Maintainability & Upgrades | Risk Level | Weighted Score |
|---|:---:|:---:|:---:|:---:|:---:|
| **Strategy 1: Direct Bundle Reuse** (`assets/tiptap/`) | **5.0 / 5** (100% authentic) | **4.8 / 5** (Immediate reuse) | 3.2 / 5 (Frozen to v16.7.5) | Low (Proven 15/15 PASS) | **4.35 / 5** |
| **Strategy 2: Rebuild from Scratch** (Vue 3 + TipTap 2.x) | 3.0 / 5 (High probability of visual/table regressions) | 1.5 / 5 (Months of work) | **4.8 / 5** (Full source control) | **Critical** (High regression risk) | **2.95 / 5** |
| **Strategy 3: Hybrid Clean Host + Bundle** (RECOMMENDED) | **4.9 / 5** (Authentic bundle + clean shims) | **4.4 / 5** (Clean bridge wrapper) | **4.5 / 5** (Modular host architecture) | **Lowest** (Best of both worlds) | **4.65 / 5** |

#### Verdict:
**Strategy 3 (Hybrid Clean Host)** is selected. It mounts the unchanged production editor bundle within a robust, modern bridge host, preserving 100% of the authentic OPPO behaviors while isolating the surrounding application from legacy quirks.

---

## 3. Backend & Cloud Synchronization Scoring Matrix

| Backend Candidate | Relational Schema Fit | Offline Sync Model | S3 Attachment Storage | Self-Hostability | Vendor Independence | Weighted Score |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Supabase (PostgreSQL)** | **5.0 / 5** (Mirrors SQLite Room v47) | **4.6 / 5** (Delta sync + RLS) | **4.8 / 5** (Built-in S3 API) | **5.0 / 5** (Official Docker) | **4.8 / 5** (Standard SQL) | **4.84 / 5** |
| **Appwrite** | 3.2 / 5 (Document NoSQL model) | 3.5 / 5 (Custom outbox needed) | 4.5 / 5 (Built-in storage) | 4.8 / 5 (Official Docker) | 3.8 / 5 (Proprietary SDK) | **3.86 / 5** |
| **Custom REST + SQLite Sync** | 4.5 / 5 (Custom designed) | **4.8 / 5** (Tailored outbox) | 2.5 / 5 (Must build MinIO) | **5.0 / 5** (Custom binary) | **5.0 / 5** (Zero lock-in) | **4.15 / 5** |
| **ElectricSQL / PowerSync** | 4.8 / 5 (SQLite replication) | **4.9 / 5** (Automated sync) | 2.0 / 5 (No blob storage) | 3.2 / 5 (Complex Elixir/PG stack)| 3.5 / 5 (Framework lock-in) | **3.88 / 5** |

#### Verdict:
**Supabase** is selected as the recommended cloud backend, with full support for self-hosting via Docker Compose.

---

## 4. Local Database Engine Scoring Matrix (for Flutter Core)

| Database Tool | SQLite3 Compatibility | Room v47 Mapping | Schema Migrations | Query Performance | Reactive Watchers | Weighted Score |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Drift (formerly Moor)** | **5.0 / 5** (Native C-sqlite3) | **4.9 / 5** (SQL DDL generator) | **4.8 / 5** (Step-by-step migrations)| **4.8 / 5** (AOT compiled) | **5.0 / 5** (Dart Streams) | **4.90 / 5** |
| **sqflite / sqflite_common_ffi**| **5.0 / 5** (Standard SQLite) | 4.0 / 5 (Manual map parsing) | 3.5 / 5 (Manual scripts) | 4.5 / 5 (Raw queries) | 3.2 / 5 (No reactive streams)| **4.10 / 5** |
| **Hive / Isar (NoSQL)** | 1.0 / 5 (No relational model) | 1.0 / 5 (Incompatible) | 2.5 / 5 (Object migrations) | **5.0 / 5** (In-memory) | 4.5 / 5 (Streams) | **2.60 / 5** |
| **ObjectBox** | 2.5 / 5 (Proprietary engine) | 2.0 / 5 (No raw SQL foreign keys)| 3.0 / 5 (Auto migrations) | **5.0 / 5** (High speed) | 4.5 / 5 (Streams) | **3.25 / 5** |

#### Verdict:
**Drift** is selected as the local database abstraction. It compiles raw SQL DDL matching Room v47 into type-safe Dart classes with automated step-by-step migration testing and reactive UI streams.

---

## 5. Vector Drawing Canvas Engine Scoring Matrix

| Drawing Engine Option | Cross-Platform Uniformity | Pressure Sensitivity | Bezier Spline Quality | PNG Export Speed | Replaces `libpaint.so` | Weighted Score |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Flutter CustomPainter (Skia)**| **5.0 / 5** (Uniform GPU canvas) | **4.8 / 5** (Stylus/Pen APIs) | **4.8 / 5** (Catmull-Rom paths) | **4.9 / 5** (Direct Skia picture) | **5.0 / 5** (Full replacement) | **4.90 / 5** |
| **HTML5 Canvas / Fabric.js** | 3.8 / 5 (WebView bridge latency) | 3.5 / 5 (Browser pointer events) | 4.2 / 5 (SVG Bezier curves) | 3.8 / 5 (Canvas toDataURL) | 4.0 / 5 (Inside webview) | **3.84 / 5** |
| **Skia Native C++ Direct** | 4.2 / 5 (Complex build scripts) | 4.5 / 5 (Direct NDK/Win32) | **5.0 / 5** (Professional curves) | **5.0 / 5** (Fastest) | **5.0 / 5** (Full replacement) | **4.65 / 5** |

#### Verdict:
**Flutter CustomPainter (leveraging Skia/Impeller)** is selected to implement the replacement vector drawing canvas. It runs on the native UI thread, provides low-latency stylus pressure tracking, smooths paths with cubic Bezier curves, and exports PNG preview images seamlessly.
