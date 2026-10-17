"""Generate real, locally authored short media. Run with a temporary ffmpeg binary.

No ffmpeg runtime is needed by Mimir or by the tests (they read committed bytes).
All test picture/sine content is generated here, without third-party assets.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ffmpeg = sys.argv[1]
directory = pathlib.Path(__file__).parent
commands = []
for name, dimensions, codec, container in [
    ('landscape.mp4', '320x180', 'libx264', 'mp4'),
    ('landscape.mov', '320x180', 'libx264', 'mov'),
    ('portrait.m4v', '180x320', 'libx264', 'mp4'),
    ('landscape.avi', '320x180', 'mjpeg', 'avi'),
    ('landscape.webm', '320x180', 'libvpx', 'webm'),
]:
    args = ['-f', 'lavfi', '-i', f'testsrc2=size={dimensions}:rate=10:duration=0.6',
            '-an', '-c:v', codec, '-threads', '1']
    if codec == 'libx264':
        args += ['-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
    elif codec == 'mjpeg':
        args += ['-q:v', '8', '-pix_fmt', 'yuvj420p']
    else:
        args += ['-b:v', '100k']
    if name.endswith('m4v'):
        args += ['-brand', 'M4V ']
    commands.append((name, args + ['-f', container], dimensions))
for name, codec, container in [
    ('tone.m4a', 'aac', 'ipod'), ('tone.aac', 'aac', 'adts'),
    ('tone.mp3', 'libmp3lame', 'mp3'), ('tone.wav', 'pcm_s16le', 'wav'),
    ('tone.ogg', 'libvorbis', 'ogg'),
]:
    commands.append((name, ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=0.6',
                           '-c:a', codec, '-threads', '1', '-f', container], None))
# A valid codec commonly unsupported by the browser, unlike a corrupt header.
commands.append(('alac.mov', ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10:duration=0.6',
                             '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=0.6',
                             '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
                             '-c:a', 'alac', '-threads', '1', '-shortest', '-movflags', '+faststart',
                             '-f', 'mov'], '320x180'))
commands.append(('fragmented.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10:duration=0.6',
                                 '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                                 '-preset', 'veryfast', '-threads', '1',
                                 '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
                                 '-f', 'mp4'], '320x180'))
only = set(sys.argv[2:])
manifest = {'generator': subprocess.check_output([ffmpeg, '-version'], text=True).splitlines()[0],
            'content': 'Locally generated FFmpeg testsrc2 and 440Hz sine; no third-party content.',
            'files': []}
if only:
    manifest = json.loads((directory / 'manifest.json').read_text())
    manifest['files'] = [item for item in manifest['files'] if item['name'] not in only]
for name, args, dimensions in commands:
    if only and name not in only:
        continue
    path = directory / name
    command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', *args, str(path)]
    subprocess.run(command, check=True)
    # Actually decode every stream, not merely probe the container header.
    decoded = subprocess.run([ffmpeg, '-hide_banner', '-i', str(path), '-f', 'null', '-'],
                             capture_output=True, text=True, check=True)
    log = decoded.stderr
    duration = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', log)
    seconds = (int(duration[1])*3600+int(duration[2])*60+float(duration[3])) if duration else None
    streams = [line.strip() for line in log.splitlines() if 'Stream #' in line and ('Video:' in line or 'Audio:' in line)]
    manifest['files'].append({'name': name, 'bytes': path.stat().st_size,
                              'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                              'durationSecondsReported': seconds, 'dimensions': dimensions,
                              'decodeExitCode': decoded.returncode, 'streams': streams,
                              'arguments': args})
(directory / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps([(f['name'],f['bytes'],f['decodeExitCode']) for f in manifest['files']]))
