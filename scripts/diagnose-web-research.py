"""Check search and public-page reading without private conversations or tokens."""
import argparse
import asyncio
from lumen.web_search import search_web
from lumen.web_pages import retrieve_sources


async def main(query):
    results = await search_web(query)
    excerpts = await retrieve_sources(results)
    print('Search results:', len(results['sources']))
    for source, text in zip(results['sources'], excerpts):
        print(f"[{source['number']}] {source['title']}")
        print(' ', source['retrieval']['status'], 'characters:', len(text))
    for warning in results['warnings']:
        print('Warning:', warning)


parser = argparse.ArgumentParser()
parser.add_argument('--query', default='ribeye steak skillet recipe')
args = parser.parse_args()
asyncio.run(main(args.query))
