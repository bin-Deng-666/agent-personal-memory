#!/usr/bin/env python3
"""Exercise a real same-window panel; --claude also exercises Claude's plugin/MCP path."""
import os, pty, select, subprocess, tempfile, json, time, fcntl, termios, struct, shlex, sys, shutil, re, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
root=Path(__file__).resolve().parent.parent
runtime=root/'packages/claude-code/runtime.mjs'
use_claude='--claude' in sys.argv
interactive='--interactive' in sys.argv
close_only='--close' in sys.argv
sandbox=Path(tempfile.mkdtemp(prefix='personal-memory-terminal-'))
socket='pm-test-'+str(os.getpid())
child=None; popup=None; server=None; output=''; requests=[]
env=os.environ.copy();env['TERM']='xterm-256color';env['PERSONAL_MEMORY_DIR']=str(sandbox/'memory')
env['CLAUDE_CONFIG_DIR']=str(sandbox/'claude');env.pop('CLAUDECODE',None)
records=sandbox/'memory/records';records.mkdir(parents=True)
record={'id':'fixture','version':1,'title':'Fixture habit','content':'Answer with a conclusion first.','type':'稳定偏好','scope':'Internal scope','certainty':'明确','tags':[],'createdAt':'2026-01-01T00:00:00Z','updatedAt':'2026-01-01T00:00:00Z','sources':[]}
(records/'preferences.json').write_text(json.dumps({'schemaVersion':1,'type':'稳定偏好','memories':[record]}))
class Provider(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  if '/messages' not in self.path:
   self.send_response(200);self.end_headers();self.wfile.write(b'{}');return
  requests.append(body)
  session=re.search(r'Claude sessionId: ([a-f0-9-]+)',json.dumps(body,ensure_ascii=False))
  result_seen=any('tool_result' in json.dumps(message) for message in body.get('messages',[]))
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  def emit(kind,value):self.wfile.write(('event: '+kind+'\ndata: '+json.dumps({'type':kind,**value})+'\n\n').encode());self.wfile.flush()
  emit('message_start',{'message':{'id':'fixture-response','type':'message','role':'assistant','model':'claude-sonnet-4-6','content':[],'stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':20,'output_tokens':0}}})
  emit('content_block_start',{'index':0,'content_block':{'type':'text','text':''}})
  emit('content_block_delta',{'index':0,'delta':{'type':'text_delta','text':'Returned to the same Claude conversation.'}});reason='end_turn'
  emit('content_block_stop',{'index':0});emit('message_delta',{'delta':{'stop_reason':reason,'stop_sequence':None},'usage':{'output_tokens':20}});emit('message_stop',{})
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',32,110,0,0))
def pump(seconds=.2):
 global output
 until=time.monotonic()+seconds
 while time.monotonic()<until:
  ready,_,_=select.select([master],[],[],min(.1,max(0,until-time.monotonic())))
  if ready:
   try:output+=os.read(master,65536).decode(errors='replace')
   except OSError:return

def wait_for(predicate,description,seconds=20):
 deadline=time.monotonic()+seconds
 while time.monotonic()<deadline:
  pump()
  if predicate():return
 raise AssertionError(description+' did not appear; output tail: '+repr(output[-1800:]))
def send(text):os.write(master,text.encode());pump(1.2 if text=='\x1b' else .4)
def stored():return json.loads((records/'preferences.json').read_text())['memories'][0]
def enabled():return json.loads((sandbox/'memory/settings.json').read_text())['enabled']
def controlling_terminal():os.setsid();fcntl.ioctl(slave,termios.TIOCSCTTY,0)
try:
 if use_claude:
  server=ThreadingHTTPServer(('127.0.0.1',0),Provider);threading.Thread(target=server.serve_forever,daemon=True).start()
  env.update({'ANTHROPIC_API_KEY':'local-test','ANTHROPIC_BASE_URL':'http://127.0.0.1:'+str(server.server_port),'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1','DISABLE_AUTOUPDATER':'1'});env.pop('ANTHROPIC_AUTH_TOKEN',None)
  subprocess.run([shutil.which('node'),str(runtime),'install-command'],env=env,stdout=subprocess.DEVNULL,check=True)
  if interactive:
   config=Path(env['CLAUDE_CONFIG_DIR']);config.mkdir(parents=True,exist_ok=True)
   (config/'.claude.json').write_text(json.dumps({'hasCompletedOnboarding':True,'theme':'dark','customApiKeyResponses':{'approved':['local-test'],'rejected':[]},'projects':{str(sandbox):{'hasTrustDialogAccepted':True,'hasCompletedProjectOnboarding':True,'allowedTools':[]}}}))
   args=['claude','--plugin-dir',str(root/'packages/claude-code'),'--permission-mode','dontAsk','--model','claude-sonnet-4-6']
  else:args=['claude','--plugin-dir',str(root/'packages/claude-code'),'--setting-sources','','--permission-mode','dontAsk','--model','claude-sonnet-4-6','-p','/personal-memory','--output-format','json']
  parent='printf "Claude fixture waiting\\n"; '+' '.join(shlex.quote(arg)for arg in args)+'; read result'
 else:parent='printf "Claude fixture waiting\\n"; read result'
 child=subprocess.Popen(['tmux','-L',socket,'-f','/dev/null','new-session','-s','test','-c',str(sandbox),parent],stdin=slave,stdout=slave,stderr=slave,env=env,preexec_fn=controlling_terminal)
 os.close(slave)
 wait_for(lambda:'Claude fixture waiting' in output,'parent terminal')
 subprocess.run(['tmux','-L',socket,'set-option','-sg','escape-time','10'],check=True)
 if not use_claude:
  command=' '.join(shlex.quote(x)for x in [shutil.which('node'),str(runtime),'panel',str(sandbox/'result.json')])
  popup=subprocess.Popen(['tmux','-L',socket,'display-popup','-t','test:0.0','-w','96%','-h','94%','-T','Personal Memory','-e','PERSONAL_MEMORY_DIR='+str(sandbox/'memory'),'-E',command],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
 if interactive:
  wait_for(lambda:'Yes, I trust this folder' in output or 'shortcuts' in output,'Claude startup',30)
  # Trust only this generated fixture directory if the host asks on first launch.
  if 'Yes, I trust this folder' in output:
   send('\x1b[B');send('\r');pump(4)
  send('/personal-memory');send('\r')
 wait_for(lambda:'Library' in output and 'Advice' in output,'real dashboard',40)
 if use_claude:assert len(requests)==0,'Opening the panel must not send any model request'
 send('\r');wait_for(lambda:'Fixture habit' in output,'library')
 send('\r');wait_for(lambda:'Original words' in output,'detail actions')
 send('\r');wait_for(lambda:'Current content' in output,'field editor')
 send('\r');wait_for(lambda:'Enter Save' in output,'text editor')
 send('\x01\x0bUpdated fixture habit.\r');wait_for(lambda:stored()['content']=='Updated fixture habit.','saved edit')
 send('\x1b');send('\x1b');send('\t');wait_for(lambda:not enabled(),'off switch');send('\t');wait_for(enabled,'on switch')
 if close_only:
  send('\x1b');pump(1)
  assert len(requests)==0,'Closing management must not trigger an agent response'
 else:
  send('\x1b[B');send('\x1b[B');send('\r');wait_for(lambda:'Question' in output,'advice input')
  if use_claude:assert len(requests)==0,'Editing/toggling must not send any model request'
  send('A synthetic advice question?\r')
 if use_claude and not close_only:
  wait_for(lambda:any('A synthetic advice question?' in json.dumps(body) for body in requests),'Advice question returned through the submit hook')
  wait_for(lambda:'Returned to the same Claude conversation.' in output,'Claude continuation')
  assert len(requests)==1,'Only the submitted Advice question should start the agent'
 elif not use_claude:
  wait_for(lambda:(sandbox/'result.json').exists(),'advice handoff');assert json.loads((sandbox/'result.json').read_text())['question']=='A synthetic advice question?'
  popup.wait(timeout=5);assert popup.returncode==0,popup.stderr.read().decode()
 parent=subprocess.check_output(['tmux','-L',socket,'capture-pane','-t','test:0.0','-p'],text=True)
 if interactive:
  assert '❯' in parent and '←→ Action' not in parent,'Claude input was not restored after closing the popup'
 else:
  assert 'Claude fixture waiting' in parent or 'Returned to the same Claude conversation.' in parent,'Original conversation pane was not restored'
 print(('Real Claude submit-hook + ' if use_claude else '')+'tmux/PTY passed: zero model requests for opening/editing/toggling; '+('zero requests on close' if close_only else 'one request only after Advice submit')+'; same-pane restoration.')
finally:
 subprocess.run(['tmux','-L',socket,'kill-server'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if child:
  try:child.wait(timeout=3)
  except subprocess.TimeoutExpired:child.kill()
 if popup and popup.poll()is None:popup.kill()
 os.close(master)
 if server:server.shutdown();server.server_close()
 shutil.rmtree(sandbox)
