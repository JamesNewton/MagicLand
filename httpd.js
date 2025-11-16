
var formidable = require('formidable');
//formidable is required to deal with file uploads from forms. 
//https://froala.com/wysiwyg-editor/docs/sdks/nodejs/file-server-upload/

//const ws = require('ws'); //websocket
// ws may be used to access local server ports, chat, teleop, etc... in the future.
// https://github.com/websockets/ws 

//Everything else is built in.
var http = require('http'); 
var url = require('url'); //url parsing
var fs = require('fs'); //file system
var net = require('net'); //network
const path = require('path'); //parse path / file / extension
//const { spawn } = require('child_process');
// can be used in the future to provide access to console (very not secure, bad idea)

//var mime = require('mime'); //translate extensions into mime types
//skip that,it's stupidly big
var mimeTypes = {
  "css": "text/css",
  "html": "text/html",
  "gif": "image/gif",
  "jpeg": "image/jpeg",
  "jpg": "image/jpeg",
  "js": "text/javascript",
  "mp3": "audio/mpeg",
  "mp4": "video/mp4",
  "png": "image/png",
  "ico": "image/x-icon",
  "svg": "image/svg+xml",
  "txt": "text/plain"
  };

const SHARE_FOLDER = path.resolve('.'); //edit to whatever folder you want
console.log("serving files from ", SHARE_FOLDER)
 
//https://www.npmjs.com/package/ws
//console.log("now making wss");
//const wss = new ws.Server({port: 3001});    //server: http_server });
//console.log("done making wss on port: " + wss.address().port);
//

function serve_file(q, req, res){
	var filename = SHARE_FOLDER + q.pathname
    console.log("serving " , filename)
    fs.readFile(filename, function(err, data) {
        if (err) { console.log(filename, "not found")
            res.writeHead(404, {'Content-Type': 'text/html'})
            return res.end("404 Not Found")
        }  
        res.setHeader('Access-Control-Allow-Origin', '*');
        let mimeType = mimeTypes[ q.pathname.split(".").pop() ] || "application/octet-stream"
        console.log("Content-Type:", mimeType)
        res.setHeader("Content-Type", mimeType);
        res.writeHead(200)
        res.write(data)
        return res.end()
    })
}

function isBinary(byte) { //must use numbers, not strings to compare. ' ' is 32
  if (byte >= 32 && byte < 128) {return false} //between space and ~
  if ([13, 10, 9].includes(byte)) { return false } //or text ctrl chars
  return true
}

//standard web server to serve files
var http_server = http.createServer(function (req, res) {
  //see https://nodejs.org/api/http.html#http_class_http_incomingmessage 
  //for the format of q. 
  var q = url.parse(req.url, true)
  console.log("web server passed pathname: " + q.pathname)
  if (q.pathname === "/") {
      q.pathname = "index.html"
  }
  else if (q.pathname === "/edit" && q.query.list ) { 
    let listpath = SHARE_FOLDER+q.query.list
    console.log("File list:"+listpath)
    fs.readdir(listpath, {withFileTypes: true}, 
      function(err, items){ //console.log("file:" + JSON.stringify(items))
        let dir = []
        if (q.query.list != "/") { //not at root
          let now = new Date()
          dir.push({name: "..", size: "", type: "dir", date: now.getTime()})
          }
        for (i in items) { //console.log("file:", JSON.stringify(items[i]))
          if (items[i].isFile()) { 
            let size = "unknown"
            let permissions = "unknown"
            let stats = {size: "unknown"}
            try { //console.log("file:", listpath + items[i].name)
              stats = fs.statSync(listpath + items[i].name)
              size = stats["size"]
              date = stats["mtimeMs"]
              permissions = (stats.mode & parseInt('777', 8)).toString(8)
            } catch (e) {console.log("couldn't stat "+items[i].name+":"+e) }
            dir.push({name: items[i].name, size: size, type: "file", permissions: permissions, date: date})
            } //size is used to see if the file is too big to edit.
          else if (items[i].isDirectory()) {
            dir.push({name: items[i].name, size: "", type: "dir"})
            } //directories are not currently supported. 
          }
        console.log('\n\nAbout to stringify 5\n');
        res.write(JSON.stringify(dir))
        res.end()
      })
    }
  else if (q.pathname === "/edit" && q.query.edit || q.query.download) { 
    let name = q.query.edit || q.query.download
    let filename = SHARE_FOLDER + name
    console.log("serving" + filename)
    fs.readFile(filename, function(err, data) {
        if (err) {
            res.writeHead(404, {'Content-Type': 'text/html'})
            return res.end("404 Not Found "+err)
        }
        let stats = fs.statSync(filename)
        console.log(("permissions:" + (stats.mode & parseInt('777', 8)).toString(8)))
        let line = 0;
        for (let i = 0; i < data.length; i++) { 
            if (10==data[i]) line++
            if ( isBinary(data[i]) ) { console.log("binary data:" + data[i] + " at:" + i + " line:" + line)
                res.setHeader("Content-Type", "application/octet-stream")
                break
                }
            }
        if (q.query.download) 
            res.setHeader("Content-Disposition", "attachment; filename=\""+path.basename(filename)+"\"")
        res.writeHead(200)
        res.write(data)
        return res.end()
      })
    }
    else if (q.pathname === "/edit" && req.method == 'DELETE' ) { //console.log("edit delete:"+JSON.stringify(req.headers))
      const form = new formidable.IncomingForm({ multiples: true });
      form.parse(req, (err, fields, files) => { 
        console.log(JSON.stringify({ fields, files }, null, 2) +'\n'+ err)
        let delfile = SHARE_FOLDER + fields.path
        console.log("delete:"+delfile+"!")
        try {fs.unlinkSync(delfile)} catch(e) {res.writeHead(400); return res.end(e)}
        return res.end('ok'); 
      });
      return
      }
    else if (q.pathname === "/edit" && req.method == 'POST' ) { 
        console.log("edit post headers:",req.headers)
        const form = new formidable.IncomingForm({ multiples: false });
        form.once('error', console.error);
        const DEFAULT_PERMISSIONS = parseInt('644', 8)
        var stats = {mode: DEFAULT_PERMISSIONS}
        form.on('file', function (formname, file) {  //console.log("edit post file", file)
          console.log("edit post update file:",file.originalFilename)
          topathfile = SHARE_FOLDER + file.originalFilename
          try { console.log("copy", file.filepath, "to", topathfile)
            stats = fs.statSync(topathfile) 
            console.log(("had permissions:" + (stats.mode & parseInt('777', 8)).toString(8)))
          } catch {} //no biggy if that didn't work
          topath = topathfile.split('/').slice(0,-1).join('/')+'/'
          try { console.log(`make folder:${topath}.`)
            fs.mkdirSync(topath, {recursive:true})
          } catch(err) { console.log(`Can't make folder:${topath}.`, err)
            res.writeHead(400)
            return res.end(`Can't make folder ${topath}:`, err)
          }
          fs.copyFile(file.filepath, topathfile, function(err) {
            let new_mode = undefined
            if (err) { console.log("copy failed:", err)
              res.writeHead(400)
              return res.end("Failed")
              }
            else {
              fs.chmodSync(topathfile, stats.mode)
              try { //sync ok because we will recheck the actual file
                let new_stats = fs.statSync(topathfile)
                new_mode = new_stats.mode
                console.log(("has permissions:" + (new_mode & parseInt('777', 8)).toString(8)))
              } catch {} //if it fails, new_mode will still be undefined
              if (stats.mode != new_mode) { //console.log("permssions wrong")
                //res.writeHead(400) //no point?
                return res.end("Permissions error")
                }
              try {fs.unlink(file.filepath, function(err) {
                if (err) console.log(file.filepath, 'not cleaned up', err);
                });
              } catch {} //usually the OS will clean up tmp files on it's own
              res.end('ok');
              }
            }) //done w/ copyFile
          });
        form.parse(req)
        return
        //res.end('ok');
      // });
      }
      else if (q.pathname === "/edit" && req.method == 'PUT' ) { console.log('edit put')
        const form = new formidable.IncomingForm({ multiples: true });
        form.parse(req, (err, fields, files) => { console.log('fields:', fields);
          let pathfile = SHARE_FOLDER + fields.path
          newpath = pathfile.split('/').slice(0,-1).join('/')+'/'
          try { console.log(`make folder:${newpath}.`)
            fs.mkdirSync(newpath, {recursive:true})
          } catch(err) { console.log(`Can't make folder:${newpath}.`, err)
            res.writeHead(400)
            return res.end(`Can't make folder ${newpath}:`, err)
          }
          if (pathfile.slice(-1)!="/") { //if it wasn't just an empty folder
              fs.writeFile(pathfile, "", function (err) { console.log('create' + pathfile)
                if (err) {console.log("failed", err)
                  res.writeHead(400)
                  return res.end("Failed:" + err)
                  }
               }); 
             }
            res.end('ok'); //console.log('done');
          });
        }
      //else if(q.pathname === "/job_button_click") {
  //	  serve_job_button_click(q, req, res)
  //}
  //else if(q.pathname === "/show_window_button_click") {
  //	  serve_show_window_button_click(q, req, res)
  //} 
  else {
  	  serve_file(q, req, res)
  }
})

http_server.listen(8080)
console.log("listening on port ", http_server.address().port)


