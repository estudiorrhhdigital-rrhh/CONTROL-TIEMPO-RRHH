"""Genera las versiones de un solo archivo del programa.

  python3 build.py                -> ControlDeTiempo.html (programa para descargar)
  python3 build.py --artifact X   -> además, X con el formato del link publicado
"""
import re
import sys

html = open('index.html', encoding='utf-8').read()
css = open('styles.css', encoding='utf-8').read()
js = open('app.js', encoding='utf-8').read()

script = '<script>\n' + js + '</script>'
full = (html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '</style>')
            .replace('<script src="app.js"></script>', script))
open('ControlDeTiempo.html', 'w', encoding='utf-8').write(full)
print('ControlDeTiempo.html generado')

if '--artifact' in sys.argv:
    destino = sys.argv[sys.argv.index('--artifact') + 1]
    title = re.search(r'<title>.*?</title>', html).group(0)
    body = html[html.index('<body>') + 6:html.index('</body>')].replace('<script src="app.js"></script>', script)
    open(destino, 'w', encoding='utf-8').write(title + '\n<style>\n' + css + '</style>\n' + body)
    print(destino, 'generado')
