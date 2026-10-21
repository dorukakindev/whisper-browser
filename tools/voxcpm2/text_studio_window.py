"""Two-column desktop studio, using the unchanged installed VoxCPM2 readers."""
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import uuid

ROOT = Path(__file__).resolve().parents[2]
TEXT_SETTINGS = {'motor': 'nano', 'mode': 'auto', 'steps': 15, 'batch': 4, 'cfg': 1.65,
                 'temperature': .8, 'pause': 1, 'max_chars': 300, 'seed': 42,
                 'normalize': True, 'align': False, 'polish': True,
                 'preview': False, 'preview_count': 2}
PRESETS = {
    'balanced': {'steps': 15, 'batch': 4, 'max_chars': 300, 'cfg': 1.65, 'temperature': .8, 'pause': 1, 'normalize': True, 'polish': True, 'align': False},
    'book': {'steps': 15, 'batch': 4, 'max_chars': 600, 'cfg': 1.65, 'temperature': .8, 'pause': 1.5, 'normalize': True, 'polish': True, 'align': False},
    'fast': {'steps': 10, 'batch': 4, 'max_chars': 300, 'cfg': 1.65, 'temperature': .8, 'pause': 1, 'normalize': True, 'polish': True, 'align': False},
}


class Studio:
    def __init__(self, args, build_command):
        self.args, self.build_command = args, build_command
        self.root = tk.Tk()
        self.root.title('Whisper Local · Ses Stüdyosu / Voice Studio')
        self.root.geometry('1300x900'); self.root.minsize(1020, 740)
        self.root.configure(bg='#10161b')
        self.settings_file = args.config.parent / 'text-studio-settings.json'
        saved = {}
        try:
            saved = json.loads(self.settings_file.read_text(encoding='utf-8'))
            if not isinstance(saved, dict): saved = {}
        except (OSError, ValueError): pass
        values = {**TEXT_SETTINGS, **{key: saved[key] for key in TEXT_SETTINGS if key in saved}}
        # Old studio stored pause as seconds, but the reader expects a factor.
        if saved.get('version') != 2: values['pause'] = 1
        self.vars = {key: (tk.BooleanVar(value=value) if isinstance(default, bool) else tk.StringVar(value=str(value)))
                     for key, default in TEXT_SETTINGS.items() for value in [values[key]]}
        for key, value in {'engine': args.engine, 'reference': args.reference, 'name': ''}.items():
            self.vars[key] = tk.StringVar(value=str(value))
        self.proc = None; self.running = False; self.stopping = False; self.closing = False
        self.output = None; self.folder = None; self.started = 0
        self.events = queue.Queue(maxsize=3000); self.controls = []; self.references = {}
        self._style(); self._layout(); self._refresh_references()
        self.vars['motor'].trace_add('write', lambda *_: self._engine_controls())
        self._engine_controls()
        if args.transcript.is_file(): self._load(args.transcript, self.transcript)
        self.root.protocol('WM_DELETE_WINDOW', self.close)
        self.root.bind('<Control-Return>', lambda _event: self.generate())
        self.root.after(100, self.poll)

    def _style(self):
        style = ttk.Style(self.root); style.theme_use('clam')
        style.configure('.', background='#182127', foreground='#e5e9ed', fieldbackground='#10161b',
                        font=('Segoe UI', 10), padding=4)
        style.configure('Card.TLabelframe', background='#182127', borderwidth=1, relief='solid')
        style.configure('Card.TLabelframe.Label', font=('Segoe UI', 11, 'bold'), foreground='#e5e9ed')
        style.configure('Muted.TLabel', foreground='#a8b4be')
        style.configure('Subtitle.TLabel', foreground='#a8b4be', font=('Segoe UI', 10))
        style.configure('TButton', background='#303b43', foreground='#ffffff', padding=(10, 7))
        style.configure('Accent.TButton', background='#d5a35c', foreground='#151b20', font=('Segoe UI', 11, 'bold'))
        style.map('TButton', background=[('active', '#43515b'), ('disabled', '#263138')], foreground=[('disabled', '#85949e')])
        style.map('TCombobox', fieldbackground=[('readonly', '#10161b')], foreground=[('readonly', '#e5e9ed')])
        style.configure('Horizontal.TProgressbar', background='#d5a35c', troughcolor='#10161b')

    def _button(self, parent, text, command, **kwargs):
        button = ttk.Button(parent, text=text, command=command, **kwargs)
        self.controls.append(button); return button

    def _card(self, parent, title):
        card = ttk.LabelFrame(parent, text=title, style='Card.TLabelframe', padding=12)
        card.pack(fill='x', pady=(0, 12)); return card

    def _field(self, parent, row, key, label, values=None, width=9):
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky='w', pady=3)
        widget = ttk.Combobox(parent, textvariable=self.vars[key], values=values, width=width) if values else ttk.Entry(parent, textvariable=self.vars[key], width=width)
        widget.grid(row=row, column=1, sticky='ew', padx=(8, 0)); self.controls.append(widget)
        return widget

    def _text(self, parent, height=5):
        frame = ttk.Frame(parent); frame.pack(fill='both', expand=True)
        text = tk.Text(frame, height=height, wrap='word', undo=True, bg='#10161b', fg='#e5e9ed',
                       insertbackground='#d5a35c', selectbackground='#715a37', font=('Segoe UI', 12), relief='flat', padx=12, pady=10)
        scrollbar = ttk.Scrollbar(frame, command=text.yview); text.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side='right', fill='y'); text.pack(side='left', fill='both', expand=True)
        self.controls.append(text); return text

    def _layout(self):
        header = ttk.Frame(self.root, padding=(20, 13)); header.pack(fill='x')
        ttk.Label(header, text='Ses Stüdyosu', font=('Segoe UI', 19, 'bold')).pack(side='left')
        ttk.Label(header, text='VoxCPM2 · Kendi sesinle metin ve kitap / Text and narration', style='Muted.TLabel').pack(side='left', padx=20)
        profiles = ttk.Frame(self.root, padding=(18, 0, 18, 12)); profiles.pack(fill='x')
        ttk.Label(profiles, text='Hazır ayarlar / Presets', style='Muted.TLabel').pack(side='left', padx=(0, 12))
        for key, label in [('balanced', 'Dengeli · önerilen / Balanced'), ('book', 'Kitap anlatımı / Narration'), ('fast', 'Hızlı deneme / Quick')]:
            self._button(profiles, label, lambda name=key: self.apply_preset(name)).pack(side='left', padx=(0, 6))
        body = ttk.Frame(self.root, padding=(18, 0)); body.pack(fill='both', expand=True)
        rail = ttk.Frame(body, width=365); rail.pack(side='left', fill='y', padx=(0, 14)); rail.pack_propagate(False)
        canvas = tk.Canvas(rail, width=345, bg='#10161b', highlightthickness=0)
        scroll = ttk.Scrollbar(rail, command=canvas.yview); scroll.pack(side='right', fill='y')
        canvas.configure(yscrollcommand=scroll.set); canvas.pack(side='left', fill='both', expand=True)
        left = ttk.Frame(canvas)
        window_id = canvas.create_window((0, 0), window=left, anchor='nw')
        left.bind('<Configure>', lambda _event: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<Configure>', lambda event: canvas.itemconfigure(window_id, width=event.width))
        self.root.bind('<MouseWheel>', lambda event: canvas.yview_scroll(-int(event.delta / 120), 'units')
                       if str(event.widget).startswith(str(left)) else None, add='+')
        right = ttk.Frame(body); right.pack(side='left', fill='both', expand=True)

        voice = self._card(left, 'Anlatıcı sesi / Narrator')
        voice.columnconfigure(1, weight=1)
        ttk.Label(voice, text='Kayıtlı ses / Saved voice').grid(row=0, column=0, sticky='w')
        self.voice_list = ttk.Combobox(voice, state='readonly', width=19)
        self.voice_list.grid(row=0, column=1, sticky='ew'); self.voice_list.bind('<<ComboboxSelected>>', self._select_saved)
        self.controls.append(self.voice_list)
        self._button(voice, 'WAV seç / Browse', self.choose_reference).grid(row=1, column=0, sticky='ew', pady=5)
        self.reference_listen = self._button(voice, 'Sesi dinle / Listen', self.listen_reference)
        self.reference_listen.grid(row=1, column=1, sticky='ew', pady=5)
        self.reference_label = ttk.Label(voice, text='', style='Muted.TLabel', wraplength=300)
        self.reference_label.grid(row=2, column=0, columnspan=2, sticky='w')
        self.reference_label.configure(text=Path(self.vars['reference'].get()).name)
        modes = ttk.Frame(voice); modes.grid(row=3, column=0, columnspan=2, sticky='w', pady=5)
        for value, label in [('auto', 'Otomatik / Auto'), ('hifi', 'Hi-Fi · birebir döküm / Transcript'), ('clone', 'Basit klonlama / Clone')]:
            radio = ttk.Radiobutton(modes, text=label, variable=self.vars['mode'], value=value)
            radio.pack(anchor='w'); self.controls.append(radio)
        self._button(voice, 'Döküm TXT seç / Transcript', lambda: self.choose_text(self.transcript)).grid(row=4, column=0, columnspan=2, sticky='ew')
        ttk.Label(voice, text='Basit klonlamada döküm gerekmez.\nClone mode needs no transcript.', style='Muted.TLabel').grid(row=5, column=0, columnspan=2, sticky='w')
        transcript_holder = ttk.Frame(voice); transcript_holder.grid(row=6, column=0, columnspan=2, sticky='ew', pady=(6, 0))
        self.transcript = self._text(transcript_holder, 3)

        motor = self._card(left, 'Motor ve kalite / Engine & quality'); motor.columnconfigure(1, weight=1)
        row = ttk.Frame(motor); row.grid(row=0, column=0, columnspan=2, sticky='w')
        for value, label in [('nano', 'Hızlı · nano-vLLM'), ('torch', 'Uyumlu · PyTorch')]:
            radio = ttk.Radiobutton(row, text=label, variable=self.vars['motor'], value=value)
            radio.pack(anchor='w'); self.controls.append(radio)
        self._field(motor, 1, 'steps', 'Kalite adımı / Steps', [10, 15, 20, 25])
        self.batch_control = self._field(motor, 2, 'batch', 'Paralel parça / Batch', [1, 2, 4, 8, 16])
        self._field(motor, 3, 'max_chars', 'Konuşma bloğu / Characters', [300, 600, 900, 1200])
        self.advanced_open = tk.BooleanVar(value=False)
        toggle = ttk.Checkbutton(motor, text='Gelişmiş ayarlar / Advanced', variable=self.advanced_open, command=self.toggle_advanced)
        toggle.grid(row=4, column=0, columnspan=2, sticky='w', pady=(8, 0)); self.controls.append(toggle)
        self.advanced = ttk.Frame(motor); self.advanced.grid(row=5, column=0, columnspan=2, sticky='ew'); self.advanced.columnconfigure(1, weight=1)
        self._field(self.advanced, 0, 'cfg', 'Referansa bağlılık / CFG', [1.3, 1.65, 2, 2.5])
        self.temperature_control = self._field(self.advanced, 1, 'temperature', 'Çeşitlilik / Temperature', [.6, .8, 1])
        self._field(self.advanced, 2, 'pause', 'Durak çarpanı / Pause', [.5, 1, 1.5, 1.8])
        self._field(self.advanced, 3, 'seed', 'Tekrarlanabilirlik / Seed')
        self._button(self.advanced, 'Motor klasörü / Engine folder', self.choose_engine).grid(row=4, column=0, columnspan=2, sticky='ew', pady=(6, 0))
        self.advanced.grid_remove()

        post = self._card(left, 'Son işlem / Finishing')
        for key, label in [('normalize', 'Ses yüksekliğini dengele / Normalize'), ('polish', 'Parça geçişlerini yumuşat / Smooth joins'),
                           ('align', 'Kelime vurgulu okuyucu oluştur / Alignment'), ('preview', 'Yalnız kısa örnek / Preview only')]:
            check = ttk.Checkbutton(post, text=label, variable=self.vars[key]); check.pack(anchor='w'); self.controls.append(check)
        preview = ttk.Frame(post); preview.pack(fill='x', pady=4); preview.columnconfigure(1, weight=1)
        self._field(preview, 0, 'preview_count', 'Örnekte parça sayısı / Parts', [1, 2, 3, 5])

        manuscript = ttk.LabelFrame(right, text='Okunacak metin / Manuscript', padding=12, style='Card.TLabelframe')
        manuscript.pack(fill='both', expand=True)
        toolbar = ttk.Frame(manuscript); toolbar.pack(fill='x', pady=(0, 8))
        self._button(toolbar, 'Dosyadan aç / Open TXT', lambda: self.choose_text(self.text)).pack(side='left')
        self._button(toolbar, 'Temizle / Clear', self.clear_text).pack(side='left', padx=6)
        ttk.Label(toolbar, text='Çıktı adı / Name').pack(side='left', padx=(10, 4))
        name = ttk.Entry(toolbar, textvariable=self.vars['name'], width=22); name.pack(side='left', fill='x', expand=True); self.controls.append(name)
        self.text = self._text(manuscript, 15)
        self.text.bind('<<Modified>>', self._count)
        self.count_label = ttk.Label(manuscript, text='0 karakter / characters', style='Muted.TLabel'); self.count_label.pack(anchor='w', pady=5)
        ttk.Label(manuscript, text='Tam cümleler birlikte okunur; görsel satır kayması metni bölmez.\n300 karakter dengeli; 600 daha uzun bağlam. Kelime vurgusu yalnız oynatım içindir.\nComplete sentences share context; 300 characters by default. Word highlighting does not split speech.',
                  style='Muted.TLabel', wraplength=680).pack(anchor='w')
        self.log_card = ttk.LabelFrame(right, text='İşlem günlüğü / Job log', padding=10, style='Card.TLabelframe')
        self.log_card.pack(fill='x', pady=(12, 0))
        self.log = self._text(self.log_card, 6); self.controls.remove(self.log); self.log.configure(state='disabled', font=('Consolas', 9))

        footer = ttk.Frame(self.root, padding=(18, 12)); footer.pack(fill='x')
        self.generate_button = ttk.Button(footer, text='Seslendir / Generate', command=self.generate, style='Accent.TButton')
        self.generate_button.pack(side='left', padx=(0, 12)); self.controls.append(self.generate_button)
        self._button(footer, 'Kısa örnek / Preview', lambda: self.generate(True)).pack(side='left', padx=(0, 12))
        middle = ttk.Frame(footer); middle.pack(side='left', fill='x', expand=True)
        self.status = tk.StringVar(value='Metni yapıştır veya aç, sonra Seslendir / Ctrl+Enter')
        status_label = ttk.Label(middle, textvariable=self.status, wraplength=400)
        status_label.pack(anchor='w')
        middle.bind('<Configure>', lambda event: status_label.configure(wraplength=max(120, event.width)))
        self.progress = ttk.Progressbar(middle, maximum=100); self.progress.pack(fill='x', pady=(4, 0))
        self.stop_button = ttk.Button(footer, text='Durdur / Stop', command=self.stop, state='disabled'); self.stop_button.pack(side='left', padx=8)
        self.listen_button = ttk.Button(footer, text='Sesi aç / Listen', command=self.listen, state='disabled'); self.listen_button.pack(side='left')
        ttk.Button(footer, text='Klasörü aç / Files', command=self.open_folder).pack(side='left', padx=(8, 0))

    def _refresh_references(self):
        candidates = [Path(self.vars['reference'].get())]
        engine = Path(self.vars['engine'].get())
        candidates.extend(engine.glob('*.wav'))
        candidates.extend((self.args.storage / 'Ses referansları').glob('*/reference.wav'))
        self.references = {}
        for file in candidates:
            if not file.is_file(): continue
            name = file.stem
            try:
                meta = json.loads(file.with_suffix('.json').read_text(encoding='utf-8'))
                name = str(meta.get('name') or name)
            except (OSError, ValueError, AttributeError): pass
            label = name; suffix = 2
            while label in self.references and self.references[label] != file:
                label = f'{name} ({suffix})'; suffix += 1
            self.references[label] = file
        self.voice_list.configure(values=list(self.references))
        chosen = next((label for label, file in self.references.items() if file == Path(self.vars['reference'].get())), '')
        self.voice_list.set(chosen)

    def toggle_advanced(self):
        if self.advanced_open.get(): self.advanced.grid()
        else: self.advanced.grid_remove()

    def _engine_controls(self):
        unavailable = self.running or self.vars['motor'].get() == 'torch'
        for widget in (self.batch_control, self.temperature_control): widget.configure(state='disabled' if unavailable else 'normal')
        self.reference_listen.configure(state='disabled' if self.running or not Path(self.vars['reference'].get()).is_file() else 'normal')

    def apply_preset(self, name):
        if self.running: return
        for key, value in PRESETS[name].items(): self.vars[key].set(value)
        self.vars['preview'].set(False)
        self._engine_controls()
        self.status.set({'balanced':'Dengeli: 15 adım · 300 karakter · yumuşak geçiş / Balanced',
                         'book':'Kitap: 600 karakter · doğal paragraf durakları / Narration',
                         'fast':'Hızlı: 10 adım · önce kısa örnekle deneyin / Quick'}[name])

    def listen_reference(self):
        file = Path(self.vars['reference'].get())
        if file.is_file(): os.startfile(file)

    def _select_saved(self, _event=None):
        file = self.references.get(self.voice_list.get())
        if file: self.set_reference(file)

    def set_reference(self, file):
        self.vars['reference'].set(str(file)); self.reference_label.configure(text=file.name)
        self.transcript.delete('1.0', 'end')
        if file.with_suffix('.txt').is_file(): self._load(file.with_suffix('.txt'), self.transcript)
        self._engine_controls()

    def choose_reference(self):
        file = filedialog.askopenfilename(parent=self.root, filetypes=[('WAV voice', '*.wav')])
        if file: self.set_reference(Path(file)); self._refresh_references()

    def choose_engine(self):
        folder = filedialog.askdirectory(parent=self.root)
        if folder: self.vars['engine'].set(folder); self._refresh_references()

    def _load(self, file, widget):
        try:
            if Path(file).stat().st_size > 2_000_000: raise ValueError('Metin dosyası çok büyük / File too large.')
            import sys
            sys.path.insert(0, str(ROOT / 'backend'))
            from subtitle_text import read_subtitle_text
            text = read_subtitle_text(file)[0]; widget.delete('1.0', 'end'); widget.insert('1.0', text)
        except (OSError, ValueError) as error: messagebox.showerror('Whisper Local', str(error), parent=self.root)

    def choose_text(self, widget):
        file = filedialog.askopenfilename(parent=self.root, filetypes=[('Text', '*.txt')])
        if file:
            self._load(file, widget)
            if widget is self.text and not self.vars['name'].get(): self.vars['name'].set(Path(file).stem)

    def clear_text(self):
        if self.text.get('1.0', 'end').strip() and not messagebox.askyesno('Whisper Local', 'Metni temizle? / Clear text?', parent=self.root): return
        self.text.delete('1.0', 'end')

    def _count(self, _event=None):
        if self.text.edit_modified():
            count = len(self.text.get('1.0', 'end-1c'))
            self.count_label.configure(text=f'{count:,} karakter / characters'); self.text.edit_modified(False)

    def _locked(self, locked):
        for control in self.controls: control.configure(state='disabled' if locked else 'normal')
        if not locked: self.voice_list.configure(state='readonly')
        self.stop_button.configure(state='normal' if locked else 'disabled')
        self._engine_controls()

    def publish(self, kind, value):
        while True:
            try: self.events.put_nowait((kind, value)); return
            except queue.Full:
                try: self.events.get_nowait()
                except queue.Empty: pass

    def generate(self, preview_override=None):
        if self.running: return
        body = self.text.get('1.0', 'end').strip(); prompt = self.transcript.get('1.0', 'end').strip()
        if not body or len(body) > 500_000 or len(prompt) > 8000:
            messagebox.showerror('Whisper Local', 'Metin veya döküm boyutunu kontrol edin. / Check text length.', parent=self.root); return
        settings = {key: variable.get() for key, variable in self.vars.items()}
        if preview_override is not None: settings['preview'] = preview_override
        try:
            identifier = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8]
            folder = self.args.storage / 'Girdi' / 'Metin' / identifier; folder.mkdir(parents=True)
            name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', settings['name']).strip(' .')[:90] or 'metin'
            sample_tag = '-ornek' if settings['preview'] else ''
            output = self.args.storage / 'Çıktı' / f'{name}{sample_tag}-{identifier}.wav'; output.parent.mkdir(parents=True, exist_ok=True)
            source, transcript = folder / 'metin.txt', folder / 'referans.txt'
            source.write_text(body, encoding='utf-8-sig'); transcript.write_text(prompt, encoding='utf-8')
            argv = self.build_command(Path(settings['engine']), Path(settings['reference']), transcript, source, output, settings)
            (folder / 'settings.json').write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding='utf-8')
            self.settings_file.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.settings_file.with_suffix('.' + uuid.uuid4().hex + '.tmp')
            temporary.write_text(json.dumps({'version': 2, **{key: self.vars[key].get() for key in TEXT_SETTINGS}}), encoding='utf-8')
            os.replace(temporary, self.settings_file)
        except (OSError, ValueError) as error:
            messagebox.showerror('Whisper Local', str(error), parent=self.root); return
        self.running = True; self.stopping = False; self.output = output; self.folder = folder
        self.started = time.monotonic(); self._locked(True); self.listen_button.configure(state='disabled')
        self.progress.configure(value=0); self.status.set('Motor hazırlanıyor / Loading engine…')
        threading.Thread(target=self._worker, args=(argv, folder, settings), daemon=True).start()

    def _kill(self, proc):
        if os.name == 'nt':
            result = subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, timeout=20)
            if result.returncode and proc.poll() is None: raise OSError('Stop failed / Durdurma doğrulanamadı')
        else: proc.terminate()

    def _worker(self, argv, folder, settings):
        proc = None
        try:
            env = os.environ.copy(); env.update(VOXCPM_ROOT=settings['engine'], PYTHONUTF8='1', HF_HUB_DISABLE_XET='1')
            env['PATH'] = str(ROOT / 'backend/bin') + os.pathsep + str(Path(settings['engine']) / '.venv/Lib/site-packages/torch/lib') + os.pathsep + env.get('PATH', '')
            proc = subprocess.Popen(argv, cwd=settings['engine'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    text=True, encoding='utf-8', errors='replace', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            self.proc = proc
            if self.stopping: self._kill(proc)
            with (folder / 'events.log').open('w', encoding='utf-8') as log:
                while True:
                    line = proc.stdout.readline(8192)
                    if not line: break
                    log.write(line); log.flush(); self.publish('line', line)
            result = {'exitCode': proc.wait(), 'cancelled': self.stopping, 'elapsedSeconds': round(time.monotonic()-self.started, 2)}
            (folder / 'job.json').write_text(json.dumps(result, indent=2), encoding='utf-8'); self.publish('done', result)
        except Exception as error:
            if proc and proc.poll() is None:
                try: self._kill(proc)
                except (OSError, subprocess.TimeoutExpired):
                    self.publish('line', 'Çocuk süreç hâlâ çalışıyor / Child process still running\n')
                proc.wait()
            self.publish('error', str(error))

    def stop(self):
        if not self.running or self.stopping: return
        self.stopping = True; self.status.set('Durduruluyor / Stopping…'); self.stop_button.configure(state='disabled')
        def kill():
            proc = self.proc
            if proc and proc.poll() is None:
                try: self._kill(proc)
                except (OSError, subprocess.TimeoutExpired) as error: self.publish('stop_error', str(error))
        threading.Thread(target=kill, daemon=True).start()

    def poll(self):
        for _ in range(150):
            try: kind, value = self.events.get_nowait()
            except queue.Empty: break
            if kind == 'line':
                self.log.configure(state='normal'); self.log.insert('end', value)
                if int(self.log.index('end-1c').split('.')[0]) > 2000: self.log.delete('1.0', '500.0')
                self.log.see('end'); self.log.configure(state='disabled')
                match = re.search(r'^\[(\d+)/(\d+)\]', value)
                if match: self.progress.configure(value=100*int(match[1])/max(1,int(match[2])))
            elif kind == 'stop_error':
                self.stopping = False; self.closing = False; self.status.set(value); self.stop_button.configure(state='normal')
            else:
                self.running = False; self.proc = None; self._locked(False)
                success = kind == 'done' and value['exitCode'] == 0 and not value['cancelled'] and self.output.is_file() and self.output.stat().st_size > 44
                if success:
                    self.status.set(f"Hazır / Ready · {value['elapsedSeconds']:.1f} s · {self.output.name}")
                    self.progress.configure(value=100); self.listen_button.configure(state='normal')
                else: self.status.set('Durduruldu / Stopped' if self.stopping else 'Başarısız / Failed · ' + str(value))
                if self.closing: self.root.destroy(); return
        if self.running and not self.stopping: self.status.set(f'Üretiliyor / Generating · {time.monotonic()-self.started:.0f} s')
        self.root.after(100, self.poll)

    def listen(self):
        if self.output and self.output.is_file(): os.startfile(self.output)

    def open_folder(self):
        self.args.storage.mkdir(parents=True, exist_ok=True); os.startfile(self.args.storage)

    def close(self):
        if self.running:
            if not messagebox.askyesno('Whisper Local', 'Üretimi durdurup kapat? / Stop generation and close?', parent=self.root): return
            self.closing = True; self.stop()
        else: self.root.destroy()

    def run(self):
        self.root.mainloop()
