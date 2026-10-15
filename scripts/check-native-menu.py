#!/usr/bin/env python3
"""Real interactive Claude native menu, using a local model fixture; no tmux or launcher."""
import os,pty,select,subprocess,tempfile,json,time,fcntl,termios,struct,shutil,threading,re
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
root=Path(__file__).resolve().parent.parent
sandbox=Path(tempfile.mkdtemp(prefix='personal-memory-native-'))
runtime=root/'packages/claude-code/runtime.mjs'
env=os.environ.copy();env.update({'TERM':'xterm-256color','PERSONAL_MEMORY_DIR':str(sandbox/'memory'),'CLAUDE_CONFIG_DIR':str(sandbox/'claude'),'ANTHROPIC_API_KEY':'local-test','CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1','DISABLE_AUTOUPDATER':'1'})
for key in ['TMUX','TMUX_PANE','CLAUDECODE','ANTHROPIC_AUTH_TOKEN']:env.pop(key,None)
records=sandbox/'memory/records';records.mkdir(parents=True)
record={'id':'fixture','version':1,'title':'Fixture habit','content':'Answer with a conclusion first.','type':'稳定偏好','scope':'Internal scope','certainty':'明确','tags':[],'createdAt':'2026-01-01T00:00:00Z','updatedAt':'2026-01-01T00:00:00Z','sources':[]}
(records/'preferences.json').write_text(json.dumps({'schemaVersion':1,'type':'稳定偏好','memories':[record]}))
output='';requests=[];child=None
class Provider(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  if '/messages' not in self.path:self.send_response(200);self.end_headers();self.wfile.write(b'{}');return
  requests.append(body)
  tools=body.get('tools',[])
  schema=next((t for t in tools if t.get('name')=='AskUserQuestion'),None)
  if schema:Path('/tmp/personal-memory-native-ask-schema.json').write_text(json.dumps(schema,indent=2))
  closed='Personal Memory menu closed. Return to the conversation' in json.dumps(body)
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  def emit(kind,value):self.wfile.write(('event: '+kind+'\ndata: '+json.dumps({'type':kind,**value})+'\n\n').encode());self.wfile.flush()
  emit('message_start',{'message':{'id':'native-fixture','type':'message','role':'assistant','model':'claude-sonnet-4-6','content':[],'stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':20,'output_tokens':0}}})
  if not closed:
   # The hook must replace this untrusted model-generated menu with the authoritative screen.
   args={'answers':{'Untrusted model menu':'Wrong A'},'questions':[{'question':'Untrusted model menu','header':'Fixture','multiSelect':False,'options':[{'label':'Wrong A','description':'Should be replaced'},{'label':'Wrong B','description':'Should be replaced'}]}]}
   emit('content_block_start',{'index':0,'content_block':{'type':'tool_use','id':'native-'+str(len(requests)),'name':'AskUserQuestion','input':{}}})
   emit('content_block_delta',{'index':0,'delta':{'type':'input_json_delta','partial_json':json.dumps(args)}});reason='tool_use'
  else:
   emit('content_block_start',{'index':0,'content_block':{'type':'text','text':''}});emit('content_block_delta',{'index':0,'delta':{'type':'text_delta','text':'Personal Memory closed.'}});reason='end_turn'
  emit('content_block_stop',{'index':0});emit('message_delta',{'delta':{'stop_reason':reason,'stop_sequence':None},'usage':{'output_tokens':20}});emit('message_stop',{})
server=ThreadingHTTPServer(('127.0.0.1',0),Provider);threading.Thread(target=server.serve_forever,daemon=True).start();env['ANTHROPIC_BASE_URL']='http://127.0.0.1:'+str(server.server_port)
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',36,120,0,0))
def pump(seconds=.2):
 global output
 until=time.monotonic()+seconds
 while time.monotonic()<until:
  ready,_,_=select.select([master],[],[],min(.1,max(0,until-time.monotonic())))
  if ready:
   try:output+=os.read(master,65536).decode(errors='replace')
   except OSError:return

def visible():return re.sub(r'\s+',' ',re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]',' ',output))
def current():
 for path in (sandbox/'memory/hosts/claude/sessions').glob('*.json'):
  data=json.loads(path.read_text())
  if data.get('menu'):return data['menu']
 return {}
def wait_for(predicate,label,seconds=30):
 deadline=time.monotonic()+seconds
 while time.monotonic()<deadline:
  pump()
  if predicate():return
 raise AssertionError(label+' missing; state='+str(current())+'; terminal='+repr(output[-2500:]))
def send(data):os.write(master,data.encode());pump(.4)
def choose(index,next_screen):
 for _ in range(index):send('\x1b[B')
 send('\r');pump(.8)
 if current().get('screen')!=next_screen:send('\r')
 wait_for(lambda:current().get('screen')==next_screen,next_screen)
 wait_for(lambda:current().get('pendingToolId') is not None,'next native chooser');pump(.8);print('Reached',next_screen,flush=True)
def controlling():os.setsid();fcntl.ioctl(slave,termios.TIOCSCTTY,0)
try:
 subprocess.run([shutil.which('node'),str(runtime),'install-command'],env=env,stdout=subprocess.DEVNULL,check=True)
 config=Path(env['CLAUDE_CONFIG_DIR']);(config/'.claude.json').write_text(json.dumps({'hasCompletedOnboarding':True,'theme':'dark','customApiKeyResponses':{'approved':['local-test'],'rejected':[]},'projects':{str(sandbox.resolve()):{'hasTrustDialogAccepted':True,'hasCompletedProjectOnboarding':True,'allowedTools':[]}}}))
 args=['claude','--plugin-dir',str(root/'packages/claude-code'),'--model','claude-sonnet-4-6']
 child=subprocess.Popen(args,cwd=sandbox,env=env,stdin=slave,stdout=slave,stderr=slave,preexec_fn=controlling);os.close(slave)
 wait_for(lambda:'Yes, I trust this folder' in output or 'shift+tab to cycle' in output,'Claude startup')
 if 'Yes, I trust this folder' in output:send('\x1b[B');send('\r');pump(3)
 send('/personal-memory');send('\r')
 wait_for(lambda:current().get('pendingToolId') and 'Library' in output and 'Settings' in output,'native home chooser')
 assert 'Untrusted model menu' not in output,'Model menu was not replaced by the native hook'
 choose(0,'library');wait_for(lambda:'Preferences' in output,'visible category')
 choose(0,'record');wait_for(lambda:'Original' in output and 'words' in output,'detail actions')
 choose(0,'edit');choose(0,'content')
 send('\x1b[B');send('\x1b[B');send('Updated native fixture.');send('\r');pump(1)
 wait_for(lambda:json.loads((records/'preferences.json').read_text())['memories'][0]['content']=='Updated native fixture.','native free-text save');print('Saved native content',flush=True)
 wait_for(lambda:current().get('screen')=='record' and current().get('pendingToolId'),'record after save');pump(.8)
 choose(3,'library');choose(1,'search');choose(1,'home');choose(3,'settings')
 send('\r');wait_for(lambda:json.loads((sandbox/'memory/settings.json').read_text())['enabled']is False,'Off')
 wait_for(lambda:current().get('pendingToolId') is not None,'next chooser');pump(.8)
 send('\r');wait_for(lambda:json.loads((sandbox/'memory/settings.json').read_text())['enabled']is True,'On')
 wait_for(lambda:current().get('pendingToolId') is not None,'next chooser');pump(.8)
 send('\x1b[B');send('\x1b[B');send('\r');wait_for(lambda:current().get('active')is False,'Close')
 wait_for(lambda:'Personal Memory closed.' in visible(),'conversation resumed')
 assert requests and any(tool.get('name')=='AskUserQuestion' for tool in requests[0].get('tools',[]))
 print('Real interactive Claude native UI passed without tmux: authoritative choices, category/detail, Other-text edit/save, On/Off, Close and conversation return.')
finally:
 Path('/tmp/personal-memory-native-terminal.log').write_text(output)
 if child:
  child.terminate()
  try:child.wait(timeout=4)
  except subprocess.TimeoutExpired:child.kill()
 os.close(master);server.shutdown();server.server_close();shutil.rmtree(sandbox)
