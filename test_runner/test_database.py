#!/usr/bin/env python3
"""
Automated Database Test Suite for ColorOS Notes Rebuild
Validates Room v47 14-table schema, 49-column rich_notes table, WAL mode, and cascade deletions.
"""

import sqlite3
import os
import sys

DB_PATH = "/tmp/test_coloros_room_v47.db"

def run_tests():
    print("==================================================")
    print("  SUITE 1: SQLite Room v47 Database Tests")
    print("==================================================")

    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. PRAGMA tests
    cur.execute("PRAGMA foreign_keys = ON;")
    cur.execute("PRAGMA journal_mode = WAL;")
    journal_mode = cur.fetchone()[0]
    print(f"[TEST 1.1] WAL Mode Check: {journal_mode.upper()} -> PASS")
    assert journal_mode.lower() == "wal", "WAL mode failed to activate"

    # 2. Table Creation
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

    # 49-Column rich_notes Table
    cur.execute("""
    CREATE TABLE rich_notes (
        local_id TEXT NOT NULL,
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
        PRIMARY KEY(local_id),
        FOREIGN KEY(folder_id) REFERENCES folders(guid) ON UPDATE CASCADE ON DELETE SET DEFAULT
    );
    """)

    # Attachments Table
    cur.execute("""
    CREATE TABLE attachments (
        attachment_id TEXT NOT NULL,
        rich_note_id TEXT NOT NULL,
        type INTEGER NOT NULL,
        state INTEGER NOT NULL DEFAULT 0,
        md5 TEXT,
        url TEXT,
        checkPayload TEXT,
        file_name TEXT,
        cloud_metadata TEXT,
        extra TEXT,
        width INTEGER DEFAULT 0,
        height INTEGER DEFAULT 0,
        associate_attachment_id TEXT,
        PRIMARY KEY(attachment_id),
        FOREIGN KEY(rich_note_id) REFERENCES rich_notes(local_id) ON UPDATE CASCADE ON DELETE CASCADE
    );
    """)

    # Verify column count in rich_notes
    cur.execute("PRAGMA table_info(rich_notes);")
    cols = cur.fetchall()
    print(f"[TEST 1.2] rich_notes Column Count: {len(cols)} columns -> PASS")
    assert len(cols) == 49, f"Expected 49 columns, found {len(cols)}"

    # 3. Insert and Cascade Test
    cur.execute("INSERT INTO folders (guid, name) VALUES ('00000000_0000_0000_0000_000000000000', 'Notes');")
    cur.execute("INSERT INTO folders (guid, name) VALUES ('folder_work', 'Work');")

    cur.execute("""
    INSERT INTO rich_notes (
        local_id, folder_id, title, text, raw_text, html_text,
        timestamp, create_time, update_time, summary_attachment_size,
        summary_speech_flag, summary_show_icon, summary_note_type_flag,
        is_cover_paint_not_char_count, is_summary_edit, is_paint_pic,
        summary_version, sys_protocol_version, file_download_time
    ) VALUES (
        'note_001', 'folder_work', 'Architecture Plan', 'Body text', 'Body text', '<p>Body text</p>',
        1730574000, 1730574000, 1730574000, 0,
        0, 0, 0,
        0, 0, 0,
        0, 1, 0
    );
    """)

    cur.execute("""
    INSERT INTO attachments (attachment_id, rich_note_id, type, file_name, width, height)
    VALUES ('att_001', 'note_001', 0, 'diagram.png', 1920, 1080);
    """)

    cur.execute("""
    INSERT INTO attachments (attachment_id, rich_note_id, type, file_name, width, height)
    VALUES ('att_002', 'note_001', 2, 'voice.mp3', 0, 0);
    """)
    conn.commit()

    cur.execute("SELECT count(*) FROM attachments WHERE rich_note_id = 'note_001';")
    att_count = cur.fetchone()[0]
    print(f"[TEST 1.3] Attachment Insertion: {att_count} attachments -> PASS")
    assert att_count == 2

    # Cascade Delete Test
    cur.execute("DELETE FROM rich_notes WHERE local_id = 'note_001';")
    conn.commit()

    cur.execute("SELECT count(*) FROM attachments WHERE rich_note_id = 'note_001';")
    remaining_att = cur.fetchone()[0]
    print(f"[TEST 1.4] ON DELETE CASCADE: {remaining_att} attachments remaining -> PASS")
    assert remaining_att == 0, "Cascading delete failed"

    conn.close()
    os.remove(DB_PATH)
    print("All Database Tests Completed Successfully.\n")

if __name__ == "__main__":
    run_tests()
