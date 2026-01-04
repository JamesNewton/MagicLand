import http.server
import socketserver
from urllib.parse import urlparse, parse_qs
import threading
import time
import json
import queue
import os
import cgi # For handling multipart form data with FieldStorage
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
        parsed_url = urlparse(self.path)
        query_string = parsed_url.query
        query = parse_qs(query_string)
        print(f"GET path: {parsed_url.path}")
        print(f"GET query: {query}")

        if self.path == '/events':
            self.handle_sse()
            return
        if self.path.startswith('/edit/?list='):
            self.handle_list_files(parsed_url, query)
            return
        if self.path.startswith('/edit/?edit=') or self.path.startswith('/edit/?download='):
            self.do_download(query)
            return
        else:
            if self.path == '':
                self.path = '/index.htm'

            # SimpleHTTPRequestHandler will call our translate_path internally
            print(f"GET: {self.path}")
            super().do_GET()

    def do_POST(self):
        """Update an EXISTING file."""
        print(f"POST: updating file")
        if self.path.startswith("/edit"):
            self.write_file('data')
        else:
            self.send_error(404)

    def do_PUT(self):
        """Upload a NEW file (or overwrite)."""
        print(f"PUT: new file")
        if self.path.startswith("/edit"):
            self.write_file('path')
        else:
            self.send_error(404)

    def do_DELETE(self):
        """Delete a file."""
        if self.path.startswith("/edit"):
            self.delete_file()
        else:
            self.send_error(404)

    def write_file(self, form_field):
        """
        Subroutine to handle POST/PUT requests for file writing.
        Extracts the filename and data from the multipart/form-data.
        """
        try:
            # FieldStorage for boundary parsing / file extraction; avoids formidable
            # https://docs.python.org/3.9/library/cgi.html
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST',
                        'CONTENT_TYPE': self.headers['Content-Type'],
                        }
            )
            #print(form)
            # get the file contend from the "data" field.
            file_item = None
            user_filename = None
            if form_field not in form:
                self.send_error(400, f"Missing '{form_field}' field in form")
                return
            file_item = form[form_field]
            #good lord... the filename is in different places based on field
            user_filename = file_item.filename if form_field == "data" else form["path"].value
            #print(" for file {user_filename}")
            if not user_filename:
                self.send_error(400, "No filename provided in form data")
                return

            # Use your existing translate_path for security patching
            filepath = self.translate_path(user_filename)

            # Ensure the directory exists (equivalent to fs.mkdirSync in node)
            target_dir = os.path.dirname(filepath)
            if not os.path.exists(target_dir): #TODO check it's a PUT
                os.makedirs(target_dir, exist_ok=True)

            # file_item.file is a file-like object containing the binary data
            with open(filepath, 'wb') as f:
                if form_field == "data":
                    f.write(file_item.file.read())

            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"ok")

        except Exception as e:
            print(f" ERROR write failed: {e}")
            self.send_error(500, f"Server Error: {str(e)}")

    def delete_file(self):
        """
        Extract 'path' from the form data and unlink that file.
        """
        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST', # FieldStorage expects POST for forms
                        'CONTENT_TYPE': self.headers['CONTENT-TYPE'],
                        }
            )
            if "path" not in form:
                self.send_error(400, "Missing 'path' field in delete request")
                return
            user_path = form.getvalue("path")
            filepath = self.translate_path(user_path)
            if not os.path.isfile(filepath):
                self.send_error(404, f"File Not Found: {user_path}")
                return
            os.remove(filepath)
            print(f"Deleted file: {filepath}")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"ok")

        except Exception as e:
            print(f"ERROR can't delete: {e}")
            self.send_error(500, f"Server Error: {str(e)}")

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
    
    def handle_list_files(self, parsed_url, query):
        dir_path = query['list'][0]
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
                    "date": int(stats.st_mtime * 1000)  # Modification time as a timestamp
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

    def is_binary(self, data):
        # Check first 1024 bytes for null bytes or control characters
        for byte in data[:1024]:
            if byte >= 32 and byte < 128: continue # space to ~
            if byte in [13, 10, 9]: continue # CR, LF, TAB
            return True
        return False

    def do_download(self, query):
        # Extract name (query params are lists in Python, take first element)
        name = query.get("edit", query.get("download"))[0]
        
        filename = self.translate_path(name)
        
        if not filename or not os.path.isfile(filename):
            self.send_error(404, f"File Not Found: {name}")
            return

        try:
            data = b""
            with open(filename, 'rb') as f:
                data = f.read()
            
            # Determine Content-Type
            content_type = "text/plain" # Default for text
            if self.is_binary(data):
                content_type = "application/octet-stream"
            
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Access-Control-Allow-Origin", "*")
            
            # If "download" was used, force attachment header
            if "download" in query:
                basename = os.path.basename(filename)
                self.send_header("Content-Disposition", f'attachment; filename="{basename}"')
            
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            self.send_error(500, str(e))

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
