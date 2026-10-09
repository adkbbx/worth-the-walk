"""Download the checked flyer for local inspection, never redistribute its image."""
from pathlib import Path
import urllib.request
import pdfplumber
folder = Path(__file__).resolve().parents[1]/'.model-cache'
folder.mkdir(exist_ok=True)
url='https://ok-corporation.jp/media-download/1737/fdd79ce358b2e6ea/PDF/'
urllib.request.urlretrieve(url,folder/'ok-flyer.pdf')
with pdfplumber.open(folder/'ok-flyer.pdf') as pdf:
    page=pdf.pages[0]
    page.to_image(resolution=110).save(folder/'ok-flyer.png')
    print((page.extract_text() or 'Image-only PDF')[:12000])
