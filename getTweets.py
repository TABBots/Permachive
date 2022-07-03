import requests
import os
import json
import sys
import asyncio
from pyppeteer import launch

# To set your enviornment variables in your terminal run the following line:
bearer_token='AAAAAAAAAAAAAAAAAAAAABoOawEAAAAAtFKRv3iHGue30w8o72eHPAWzc4I%3DHTCE7uCVR06AhhgCCC2PYar71svTTFTvChYnqS2Wtish5R0ECC'
# bearer_token = os.environ.get("BEARER_TOKEN")
count = 0
avg = 0

def bearer_oauth(r):
    """
    Method required by bearer token authentication.
    """

    r.headers["Authorization"] = f"Bearer {bearer_token}"
    r.headers["User-Agent"] = "v2FilteredStreamPython"
    return r


def get_rules():
    response = requests.get(
        "https://api.twitter.com/2/tweets/search/stream/rules", auth=bearer_oauth
    )
    if response.status_code != 200:
        raise Exception(
            "Cannot get rules (HTTP {}): {}".format(response.status_code, response.text)
        )
    print(json.dumps(response.json()))
    return response.json()


def delete_all_rules(rules):
    if rules is None or "data" not in rules:
        return None

    ids = list(map(lambda rule: rule["id"], rules["data"]))
    payload = {"delete": {"ids": ids}}
    response = requests.post(
        "https://api.twitter.com/2/tweets/search/stream/rules",
        auth=bearer_oauth,
        json=payload
    )
    if response.status_code != 200:
        raise Exception(
            "Cannot delete rules (HTTP {}): {}".format(
                response.status_code, response.text
            )
        )
    print(json.dumps(response.json()))


def set_rules(delete):
    # You can adjust the rules if needed
    sample_rules = [
        # {"value": "ኢትዮጵያ -is:retweet -is:reply", "tag": "ethiopia war"},
        {"value": "ethiopia war -is:retweet -is:reply", "tag": "ethiopia war"},
    ]
    payload = {"add": sample_rules}
    response = requests.post(
        "https://api.twitter.com/2/tweets/search/stream/rules",
        auth=bearer_oauth,
        json=payload,
    )
    if response.status_code != 201:
        raise Exception(
            "Cannot add rules (HTTP {}): {}".format(response.status_code, response.text)
        )
    print(json.dumps(response.json()))


async def get_stream(set):
    global count
    global avg
    response = requests.get(
        "https://api.twitter.com/2/tweets/search/stream?tweet.fields=author_id,context_annotations,entities&expansions=author_id", auth=bearer_oauth, stream=True,
    )
    print(response.status_code)
    if response.status_code != 200:
        raise Exception(
            "Cannot get stream (HTTP {}): {}".format(
                response.status_code, response.text
            )
        )
    for response_line in response.iter_lines():
        if response_line:
            json_response = json.loads(response_line)
            print(json.dumps(json_response, indent=4, sort_keys=True))
            url ="https://www.twitter.com/{0}/status/{1}".format(json_response['includes']['users'][0]['username'],json_response['data']['id'])
            browser = await launch(headless= True)
            page = await browser.newPage()
            await page.goto(url,waitUntil='networkidle2')

            # head = await page.querySelector('head')
            article = await page.querySelector('article')

            # head = await page.evaluate('(element) => element.outerHTML', head)
            results = await page.evaluate('(element) => element.outerHTML', article)
            # results = await page.content()
            # results = head + results

            # with open("{0}.html".format(json_response['data']['id']),"a",encoding="utf-8") as f:
            #     f.write(results)

            # # Worse case scenario, this works
            await page.screenshot({'path': 'example.png','fullPage':True})
            
            await browser.close()
            
            print(url)
            exit()
            # count = count + 1
            # if avg == 0:
            #     avg = sys.getsizeof(json.dumps(json_response, indent=4, sort_keys=True))
            # else:
            #     avg = (avg + sys.getsizeof(json.dumps(json_response, indent=4, sort_keys=True))) / 2
            # print("Count: {0}\t Avg:{1} bytes".format(count,avg))




async def main():
    rules = get_rules()
    delete = delete_all_rules(rules)
    set = set_rules(delete)
    await get_stream(set)


if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(main())
