document.body.style.visibility = 'hidden';

document.addEventListener('DOMContentLoaded', () => {
    injectStyles()
        .then(() => injectComponents())
        .then(() => {
            setTimeout(() => {
                document.body.style.visibility = 'visible';
                window.scrollTo(0, 0);
            }, 100); // Add a delay in milliseconds (e.g., 100ms)
        });
});

function injectStyles() {
    const headElements = document.querySelectorAll('head[injectComponent]');
    if (headElements.length === 0) {
        return Promise.resolve(); // No styles to inject
    }

    const promises = Array.from(headElements).map(element => {
        const componentName = element.getAttribute('injectComponent');

        return fetch(`components/${componentName}.html`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${componentName}.html`);
                }
                return response.text();
            })
            .then(data => {
                // Parse and inject each style/link tag individually
                const parser = new DOMParser();
                const doc = parser.parseFromString(data, 'text/html');
                const links = doc.querySelectorAll('link[rel="stylesheet"]');
                const linkPromises = Array.from(links).map(link => {
                    return new Promise(resolve => {
                        const newLink = document.createElement('link');
                        newLink.rel = 'stylesheet';
                        newLink.href = link.href;
                        newLink.onload = resolve; // Wait for the CSS to load
                        document.head.appendChild(newLink);
                    });
                });
                return Promise.all(linkPromises); // Wait for all CSS files to load
            })
            .catch(error => {
                console.error('Error:', error);
            });
    });

    return Promise.all(promises); // Wait for all head elements to be processed
}

function injectComponents() {
    const attr = "injectComponent";
    const elements = document.querySelectorAll(`[${attr}]`);

    if (elements.length === 0) {
        return Promise.resolve(); // No components to inject
    }

    const promises = Array.from(elements).map(element => {
        const componentName = element.getAttribute(attr);

        return fetch(`components/${componentName}.html`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${componentName}.html`);
                }
                return response.text();
            })
            .then(data => {
                element.innerHTML += data;
                element.removeAttribute(attr); // Prevent reprocessing
            })
            .catch(error => {
                console.error('Error:', error);
            });
    });

    return Promise.all(promises).then(() => {
        // Recursively process nested components
        return injectComponents();
    });
}
