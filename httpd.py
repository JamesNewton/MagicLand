import http.server
import socketserver
import threading
import time
import json
import queue
import os
import smtplib
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
        # First, let the base class get the path relative to CWD
        path = super().translate_path(path)
        
        # If the user asked for '/', serve monitor.html from inside WEB_DIR
        if self.path == '/':
            return os.path.join(os.getcwd(), WEB_DIR, 'index.htm')
            
        # For all other paths, prepend the WEB_DIR to the local path
        # This maps localhost/page.html -> ./www/page.html
        rel_path = os.path.relpath(path, os.getcwd())
        return os.path.join(os.getcwd(), WEB_DIR, rel_path)

    def do_GET(self):
        if self.path == '/events':
            self.handle_sse()
        else:
            # We no longer need to manually set self.path or self.directory
            # super().do_GET() will call translate_path() internally
            super().do_GET()

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
                    # 1. Update Web Dashboards
                    payload = json.dumps({"type": "ALERT", "message": content})
                    for q in subscriptions:
                        q.put(payload)
                    
                    # 2. Send SMS (Text Message)
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
