"""Synthetic Ollama timing probe. Does not change app settings or read chats."""
import argparse
import json
import time
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

PROMPT = ('I just finished a long day. Give me a warm, slightly witty welcome, '
          'then suggest one small relaxing activity. Use at most 80 words. '
          'Do not claim to have saved anything or performed an action.')


def measure(lines, started, clock=time.perf_counter):
    first_visible = first_thinking = None
    visible = []
    thinking_chars = 0
    final = None
    for line in lines:
        if not line.strip():
            continue
        event = json.loads(line)
        if event.get('error'):
            raise RuntimeError('Ollama reported a generation error')
        message = event.get('message', {})
        content = message.get('content') or ''
        thinking = message.get('thinking') or ''
        elapsed = clock() - started
        if content.strip() and first_visible is None:
            first_visible = elapsed
        if thinking.strip() and first_thinking is None:
            first_thinking = elapsed
        visible.append(content)
        thinking_chars += len(thinking)
        if event.get('done'):
            final = event
            break
    if final is None:
        raise RuntimeError('Incomplete stream: no final timing record')
    seconds = final.get('eval_duration', 0) / 1e9
    return {
        'first_visible_seconds': first_visible,
        'first_thinking_seconds': first_thinking,
        'wall_seconds': clock() - started,
        'load_seconds': final.get('load_duration', 0) / 1e9,
        'prompt_eval_seconds': final.get('prompt_eval_duration', 0) / 1e9,
        'generation_seconds': seconds,
        'generated_tokens': final.get('eval_count'),
        'tokens_per_second': final.get('eval_count', 0) / seconds if seconds else None,
        'separate_thinking_characters': thinking_chars,
        'visible_characters': sum(map(len, visible)),
        'done_reason': final.get('done_reason'),
        'answer': ''.join(visible),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:11434')
    parser.add_argument('--model', required=True)
    parser.add_argument('--runs', type=int, choices=range(1, 6), default=3)
    parser.add_argument('--context', type=int, default=8192)
    args = parser.parse_args()
    parsed = urlsplit(args.url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        parser.error('Use an HTTP(S) provider base URL without credentials')
    if not 1024 <= args.context <= 32768:
        parser.error('Context must be between 1024 and 32768')
    base = args.url.rstrip('/')
    # No pull or unload. Fail early if the selected model is not installed.
    with urlopen(base + '/api/tags', timeout=10) as response:
        models = json.load(response).get('models', [])
    if args.model not in {m.get('name') for m in models}:
        parser.error('Exact model name is not installed at this endpoint; no download attempted')
    payload = {'model': args.model, 'stream': True, 'keep_alive': '15m',
               'messages': [{'role': 'user', 'content': PROMPT}],
               'options': {'num_ctx': args.context, 'num_predict': 512, 'temperature': 0.7, 'seed': 42}}
    print('Synthetic direct-Ollama test; excludes app retrieval, image generation and voice.', flush=True)
    print('First run is current-state, NOT forced cold. Repeats may benefit from prompt caching.', flush=True)
    print('512-token cap; done_reason=length means truncated. Thinking text is never printed.', flush=True)
    for run in range(1, args.runs + 1):
        print(f'Running {run}/{args.runs}…', flush=True)
        started = time.perf_counter()
        request = Request(base + '/api/chat', data=json.dumps(payload).encode(),
                          headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=180) as response:
            result = measure(response, started)
        result.update(run=run, model=args.model, context=args.context)
        print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    main()
