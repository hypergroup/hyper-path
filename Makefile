
build: components index.js components
	@component build --standalone hyper-path

components: component.json
	@component install

clean:
	rm -fr build components template.js

.PHONY: clean
