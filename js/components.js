document.body.style.visibility = 'hidden';

document.addEventListener('DOMContentLoaded', () => {
    injectComponents()
        .then(() => {
            document.dispatchEvent(new Event('inject-finished'));
            setTimeout(() => {
                document.body.style.visibility = 'visible';
                window.scrollTo(0, 0);
            }, 100); // Add a delay in milliseconds (e.g., 100ms)
        });
});

function injectComponents() {
    const attr = "inject-component";
    const elements = document.querySelectorAll(`[${attr}]`);

    if (elements.length === 0) {
        return Promise.resolve(); // No components to inject
    }

    const promises = Array.from(elements).flatMap(element => {
        const componentNames = element.getAttribute(attr).split(',').map(name => name.trim());

        // Remove the attribute to prevent reprocessing
        element.removeAttribute(attr);

        return componentNames.map(componentName => {

            return fetch(`components/${componentName}.html`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to load ${componentName}`);
                    }
                    return response.text();
                })
                .then(data => {
                    // Handle key-* attribute replacements
                    const keys = Array.from(element.attributes)
                    .filter(attr => attr.name.startsWith('key-'))
                    .map(attr => ({
                        key: attr.name.replace('key-', '').toUpperCase(),
                        value: attr.value
                    }));

                    keys.forEach(({ key, value }) => {
                    const placeholder = `[${key}]`;
                    data = data.replace(placeholder, value);
                    });

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data, 'text/html');

                    // Process scripts sequentially
                    const scriptPromises = Array.from(doc.querySelectorAll('script')).reduce((promise, scriptTag) => {
                        return promise.then(() => injectScript(scriptTag));
                    }, Promise.resolve());

                    // Process <link> tags
                    doc.querySelectorAll('link').forEach(linkTag => {
                        const link = document.createElement('link');
                        Array.from(linkTag.attributes).forEach(attr => {
                            link.setAttribute(attr.name, attr.value);
                        });
                        document.head.appendChild(link);
                    });

                    // Process <style> tags
                    doc.querySelectorAll('style').forEach(styleTag => {
                        const style = document.createElement('style');
                        style.textContent = styleTag.textContent;
                        document.head.appendChild(style);
                    });

                    // Append other content as a wrapper div
                    const wrapper = document.createElement('div');
                    Array.from(doc.body.childNodes).forEach(node => {
                        wrapper.appendChild(document.importNode(node, true));
                    });
                    element.appendChild(wrapper);

                    return scriptPromises; // Ensure scripts are executed sequentially
                })
                .catch(error => {
                    console.error('Error:', error);
                });
        });
    });

    return Promise.all(promises).then(() => {
        return injectComponents(); // Recursively process nested components
    });

    function injectScript(scriptTag) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            if (scriptTag.src) {
                script.src = scriptTag.src;
                script.async = false; // Ensure sequential execution
                script.defer = false; // Prevents defer behavior for dynamic scripts
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Failed to load script: ${script.src}`));
            } else {
                script.textContent = scriptTag.textContent;
                resolve(); // Inline scripts execute immediately
            }
            document.head.appendChild(script);
        });
    }
}
