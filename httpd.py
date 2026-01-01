import http.server
import socketserver
from urllib.parse import urlparse, parse_qs
import threading
import time
import json
import queue
import os
import smtplib
import shutil
from email.message import EmailMessage

# --- Configuration ---
PORT = 8000
WATCH_DIR = "captures"
WATCH_FILE = "detection.csv"
WEB_DIR = "www"

# --- NOTIFICATION CONFIG (Email-to-SMS) ---
# To use Gmail, you MUST enable "2-Step Verification" and generate an "App Password".
# Go to: Google Account -> Security -> 2-Step Verification -> App Passwords
EMAIL_USER = "your_email@gmail.com"
EMAIL_PASS = "your_app_password_here" 

# Find your carrier's gateway below:
# Verizon:  number@vtext.com
# AT&T:     number@txt.att.net
# T-Mobile: number@tmomail.net
# Sprint:   number@messaging.sprintpcs.com
TARGET_PHONE = "5551234567@vtext.com" 

# Global list of connected clients
subscriptions = []

class DualStackServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    
    def translate_path(self, path):
        """
        Maps URL paths to the local file system, strictly inside WEB_DIR.
        Python 3.6 compatible.
        """
        # Strip query strings
        path = path.split('?', 1)[0]
        path = path.split('#', 1)[0]


        # Security: Prevent escaping up levels
        # Clean the path to remove double slashes or relative jumps
        path = path.lstrip('/')
        
        # Join with the specific WEB_DIR (The "Jail")
        # os.getcwd() is safer than hardcoding paths for portability
        full_path = os.path.join(os.getcwd(), WEB_DIR, path)
        return full_path

    def do_GET(self):
        if self.path == '/events':
            self.handle_sse()
            return
        if self.path.startswith('/edit/?list='):
            self.handle_list_files()
            return
        else:
            if self.path == '':
                self.path = '/index.htm'

            # SimpleHTTPRequestHandler will call our translate_path internally
            print(f"GET: {self.path}")
            super().do_GET()

    def do_POST(self):
        """Update an EXISTING file."""
        path = self.translate_path(self.path)
        if not os.path.exists(path):
            print(f"POST: No file {path} to update")
            self.send_error(404, "File not found. Use PUT to create new files.")
            return
        print(f"POST: updating {path}")
        self._write_file(path)

    def do_PUT(self):
        """Upload a NEW file (or overwrite)."""
        path = self.translate_path(self.path)
        # Note: Standard PUT usually implies create or replace.
        print(f"PUT: new file {path}")
        self._write_file(path)

    def do_DELETE(self):
        """Delete a file."""
        path = self.translate_path(self.path)
        
        # Safety: Don't allow deleting the folder itself or the main dashboard
        if os.path.basename(path) in ['monitor.html', '']:
            print(f"DELETE: {path} is protected.")
            self.send_error(403, "Forbidden: Cannot delete protected files.")
            return

        if os.path.exists(path):
            try:
                os.remove(path)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"Deleted")
                print(f"DELETE: {path}")
            except Exception as e:
                print(f"DELETE: {path} failed: {e}")
                self.send_error(500, f"Delete failed: {e}")
        else:
            print(f"DELETE: no file {path}")
            self.send_error(404, "File not found")

    def _write_file(self, path):
        """Helper to write raw request body to disk."""
        try:
            length = int(self.headers['Content-Length'])
            content = self.rfile.read(length)
            
            with open(path, 'wb') as f:
                f.write(content)
                
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Success")
            
            # Optional: Notify clients that the page updated?
            # broadcast_reload() 
            
        except Exception as e:
            print(f"Write to {path} failed: {e}")
            self.send_error(500, f"Write failed: {e}")

    def handle_sse(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        q = queue.Queue()
        subscriptions.append(q)
        try:
            while True:
                msg = q.get()
                self.wfile.write(f"data: {msg}\n\n".encode('utf-8'))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            if q in subscriptions:
                subscriptions.remove(q)
    
    def handle_list_files(self):
        parsed_url = urlparse(self.path)
        query_string = parsed_url.query
        query_components = parse_qs(query_string)

        print(f"Requested path: {parsed_url.path}")
        print(f"Query components: {query_components}")
        dir_path = query_components['list'][0]
        dir_path = self.translate_path(dir_path)
        result = []
        try:
            files = os.listdir(dir_path)
            #files = [f for f in files if os.path.isfile(os.path.join(dir_path, f))]
            for f in files:
                full_path = os.path.join(dir_path, f)
                stats = os.stat(full_path)
                is_dir = os.path.isdir(full_path)
                
                result.append({
                    "name": f,
                    "size": 0 if is_dir else stats.st_size,
                    "type": "dir" if is_dir else "file",
                    "date": stats.st_mtime  # Modification time as a timestamp
                })
            print(f"Listing files in {dir_path}: {result}")
            response = json.dumps(result)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(response.encode('utf-8'))
        except Exception as e:
            print(f"List files failed: {e}")
            self.send_error(500, f"List files failed: {e}")
            return

    def log_message(self, format, *args):
        pass # Silence console logs

def send_sms_notification(message_body):
    """Sends a text message via email gateway."""
    if "your_email" in EMAIL_USER: return # Skip if not configured
    
    try:
        msg = EmailMessage()
        msg.set_content(message_body)
        msg['Subject'] = 'ALERT' # Some carriers ignore this, some show it
        msg['From'] = EMAIL_USER
        msg['To'] = TARGET_PHONE

        # Connect to Gmail SMTP
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()
        print(f"SMS Sent to {TARGET_PHONE}")
    except Exception as e:
        print(f"Failed to send SMS: {e}")

def file_watcher_loop():
    file_path = os.path.join(WATCH_DIR, WATCH_FILE)
    print(f"Monitoring {file_path}...")
    
    while True:
        time.sleep(1)
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    content = f.read().strip()
                
                if content:
                    payload = json.dumps({"type": "ALERT", "message": content})
                    for q in subscriptions:
                        q.put(payload)
                    send_sms_notification(f"Home Monitor: {content}")
                os.remove(file_path)
            except Exception as e:
                print(f"Error: {e}")

if __name__ == '__main__':
    os.makedirs(WATCH_DIR, exist_ok=True)
    os.makedirs(WEB_DIR, exist_ok=True)

    # Launch file watcher in background
    threading.Thread(target=file_watcher_loop, daemon=True).start()

    # Launch Web Server
    with DualStackServer(('0.0.0.0', PORT), CustomHandler) as httpd:
        print(f"Serving {WEB_DIR} on port {PORT}...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
