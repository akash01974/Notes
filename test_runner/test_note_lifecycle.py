#!/usr/bin/env python3
"""
Automated Note Lifecycle Test Suite for ColorOS Notes Rebuild
Tests full CRUD state transitions: Creation -> Edit/Auto-save -> Soft Delete -> Restore -> Hard Delete.
"""

import sqlite3
import os
import time

DB_PATH = "/tmp/test_coloros_lifecycle.db"

def run_tests():
    print("==================================================")
    print("  SUITE 3: Note Lifecycle & State Machine Tests")
    print("==================================================")

    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON;")
    cur.execute("PRAGMA journal_mode = WAL;")

    # Schema
    cur.execute("""
    CREATE TABLE folders (
        _id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        guid TEXT NOT NULL UNIQUE,
        state INTEGER NOT NULL DEFAULT 0,
        created_time INTEGER,
        modify_device TEXT,
        data1 TEXT,
        data2 TEXT,
        encrypted INTEGER NOT NULL DEFAULT 0,
        encrypted_pre INTEGER NOT NULL DEFAULT 0,
        modify_time INTEGER,
        extra TEXT,
        sysVersion INTEGER NOT NULL DEFAULT 0,
        encryptSysVersion INTEGER NOT NULL DEFAULT 0
    );
    """)

    cur.execute("""
    CREATE TABLE rich_notes (
        local_id TEXT NOT NULL PRIMARY KEY,
        global_id TEXT,
        text TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        html_text TEXT NOT NULL,
        folder_id TEXT NOT NULL DEFAULT '00000000_0000_0000_0000_000000000000',
        timestamp INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        top_time INTEGER NOT NULL DEFAULT 0,
        recycle_time INTEGER NOT NULL DEFAULT 0,
        alarm_time INTEGER NOT NULL DEFAULT 0,
        state INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        skin_id TEXT NOT NULL DEFAULT 'default',
        title TEXT,
        raw_title TEXT,
        recycle_time_pre INTEGER DEFAULT 0,
        alarm_time_pre INTEGER DEFAULT 0,
        skin_id_pre TEXT,
        extra TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        is_local INTEGER NOT NULL DEFAULT 1,
        is_preset INTEGER NOT NULL DEFAULT 0,
        from_package TEXT,
        web_notes TEXT,
        sysVersion INTEGER DEFAULT 1,
        encrypted INTEGER NOT NULL DEFAULT 0,
        encrypted_pre INTEGER NOT NULL DEFAULT 0,
        encryptSysVersion INTEGER,
        attachment_extra TEXT,
        summary_title TEXT,
        summary_content TEXT,
        summary_phone_name TEXT,
        summary_phone_number TEXT,
        summary_attachment TEXT,
        summary_attachment_size INTEGER NOT NULL DEFAULT 0,
        summary_speech_flag INTEGER NOT NULL DEFAULT 0,
        summary_speech_type INTEGER NOT NULL DEFAULT 0,
        summary_show_icon INTEGER NOT NULL DEFAULT 0,
        summary_note_type_flag INTEGER NOT NULL DEFAULT 0,
        is_cover_paint_not_char_count INTEGER NOT NULL DEFAULT 0,
        is_summary_edit INTEGER NOT NULL DEFAULT 0,
        is_paint_pic INTEGER NOT NULL DEFAULT 0,
        summary_version INTEGER NOT NULL DEFAULT 0,
        all_attachment_file_name TEXT,
        attachment_lrc TEXT,
        sys_protocol_version INTEGER NOT NULL DEFAULT 1,
        file_download_time INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(folder_id) REFERENCES folders(guid) ON UPDATE CASCADE ON DELETE SET DEFAULT
    );
    """)

    cur.execute("INSERT INTO folders (guid, name) VALUES ('00000000_0000_0000_0000_000000000000', 'Notes');")
    conn.commit()

    # 1. Note Creation
    t0 = int(time.time() * 1000)
    note_id = "lifecycle_note_001"
    cur.execute("""
    INSERT INTO rich_notes (
        local_id, title, text, raw_text, html_text, timestamp, create_time, update_time, state, deleted,
        summary_attachment_size, summary_speech_flag, summary_show_icon, summary_note_type_flag,
        is_cover_paint_not_char_count, is_summary_edit, is_paint_pic, summary_version,
        sys_protocol_version, file_download_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0);
    """, (note_id, "Shopping List", "Milk, Bread", "Milk, Bread", "<p>Milk, Bread</p>", t0, t0, t0))
    conn.commit()

    cur.execute("SELECT state, deleted FROM rich_notes WHERE local_id = ?", (note_id,))
    state, deleted = cur.fetchone()
    print(f"[TEST 3.1] Note Creation: state={state} (New), deleted={deleted} (Active) -> PASS")
    assert state == 0 and deleted == 0

    # 2. Auto-save Update
    t1 = t0 + 5000
    cur.execute("""
    UPDATE rich_notes SET
        text = 'Milk, Bread, Eggs',
        raw_text = 'Milk, Bread, Eggs',
        html_text = '<p>Milk, Bread, Eggs</p>',
        update_time = ?,
        state = 2
    WHERE local_id = ?;
    """, (t1, note_id))
    conn.commit()

    cur.execute("SELECT text, update_time, state FROM rich_notes WHERE local_id = ?", (note_id,))
    text, update_time, state = cur.fetchone()
    print(f"[TEST 3.2] Auto-Save Edit: state={state} (Modified), update_time={update_time} -> PASS")
    assert "Eggs" in text and state == 2 and update_time == t1

    # 3. Soft Delete (Recycle Bin)
    t2 = t1 + 5000
    cur.execute("""
    UPDATE rich_notes SET deleted = 1, recycle_time = ?, state = 2 WHERE local_id = ?;
    """, (t2, note_id))
    conn.commit()

    cur.execute("SELECT count(*) FROM rich_notes WHERE deleted = 0;")
    active_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM rich_notes WHERE deleted = 1;")
    recycled_count = cur.fetchone()[0]
    print(f"[TEST 3.3] Soft Delete: active_notes={active_count}, recycled_notes={recycled_count} -> PASS")
    assert active_count == 0 and recycled_count == 1

    # 4. Restore from Recycle Bin
    cur.execute("UPDATE rich_notes SET deleted = 0, recycle_time = 0, state = 2 WHERE local_id = ?;", (note_id,))
    conn.commit()

    cur.execute("SELECT deleted FROM rich_notes WHERE local_id = ?", (note_id,))
    restored_deleted = cur.fetchone()[0]
    print(f"[TEST 3.4] Restore from Trash: deleted={restored_deleted} -> PASS")
    assert restored_deleted == 0

    # 5. Permanent Purge
    cur.execute("DELETE FROM rich_notes WHERE local_id = ?;", (note_id,))
    conn.commit()

    cur.execute("SELECT count(*) FROM rich_notes WHERE local_id = ?;", (note_id,))
    final_count = cur.fetchone()[0]
    print(f"[TEST 3.5] Permanent Deletion: count={final_count} -> PASS")
    assert final_count == 0

    conn.close()
    os.remove(DB_PATH)
    print("All Note Lifecycle Tests Completed Successfully.\n")

if __name__ == "__main__":
    run_tests()
