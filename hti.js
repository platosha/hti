{
  const privates = new WeakMap();

  class TemplatePart {
    constructor() {
      privates.set(this, {});
    }

    get expression() {
      return privates.get(this).expression;
    }

    get value() {
      return privates.get(this).value || "";
    }

    set value(value) {
      if (this.value === value) return;
      const p = privates.get(this);
      p.value = value;
      p.updateList.enqueue();
    }
  }

  class AttributeTemplatePart extends TemplatePart {
    get attributeName() {
      return privates.get(this).attributeName;
    }
  }

  class NodeTemplatePart extends TemplatePart {
    get parentNode() {
      return privates.get(this).parentNode;
    }
  }

  // FIXME: ES5 fix: make extendable DocumentFragment function (MSIE only)
  let _DocumentFragment = window.DocumentFragment;
  if (/Trident/.test(navigator.userAgent)) {
    _DocumentFragment = function() {};
    _DocumentFragment.prototype = Object.create(window.DocumentFragment.prototype,
      {constructor: {value: _DocumentFragment, configurable: true, writable: true}});
  }

  class TemplateInstance extends _DocumentFragment {
    constructor() {
      super();
      privates.set(this, {parts: [], updates: new Set()});

      // FIXME: MSEdge weirdness
      Object.setPrototypeOf(this, TemplateInstance.prototype);
    }

    update(state) {
      const {parts, updates} = privates.get(this);
      parts.forEach(part => {
        if (part.expression !== undefined) {
          part.value = String(state[part.expression]);
        }
      });
      for (let partUpdateList of updates) {
        partUpdateList.apply();
      }
      updates.clear();
    }
  }

  class PartUpdateList {
    constructor(subject, prop, instance) {
      privates.set(this, {subject, prop, instance, parts: []});
    }

    add(part) {
      privates.get(this).parts.push(part);
    }

    enqueue() {
      privates.get(privates.get(this).instance).updates.add(this);
    }

    apply() {
      const {subject, prop, parts} = privates.get(this);
      if (parts.length) {
        subject[prop] = parts.reduce((acc, cur) => {
          return acc + privates.get(cur).string + cur.value;
        }, '');
      }
    }
  }

  function* parseExpressions(string) {
    const re = /\{\{\s*([^}\s]*)\s*\}\}/gm;
    let result, firstIndex = 0;
    while ((result = re.exec(string)) !== null) {
      yield {string: string.slice(firstIndex, result.index), expression: result[1]};
      firstIndex = re.lastIndex;
    }
    if (firstIndex !== 0 && firstIndex !== string.length) {
      yield {string: string.slice(firstIndex, string.length)};
    }
  }

  function createInstance(state) {
    const instance = new TemplateInstance();
    instance.appendChild(document.importNode(this.content, true));
    const instancePrivates = privates.get(instance);
    const walker = document.createTreeWalker(instance);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.ELEMENT_NODE) {
        Array.from(node.attributes).forEach(attr => {
          const updateList = new PartUpdateList(attr, 'value', instance);
          for(let {string, expression} of parseExpressions(attr.value)) {
            const part = new AttributeTemplatePart();
            Object.assign(privates.get(part), {
              instance, updateList, string, expression,
              attributeName: attr.name
            });
            updateList.add(part);
            instancePrivates.parts.push(part);
          }
          updateList.apply();
        });
      } else {
        const updateList = new PartUpdateList(node, 'nodeValue', instance);
        for(let {string, expression} of parseExpressions(node.nodeValue)) {
          const part = new NodeTemplatePart();
          Object.assign(privates.get(part), {
            instance, updateList, string, expression,
            parentNode: node
          });
          updateList.add(part);
          instancePrivates.parts.push(part);
        }
        updateList.apply();
      }
    }

    if (state !== undefined) {
      instance.update(state);
    }

    return instance;
  }

  window.TemplateInstance = TemplateInstance;
  window.HTMLTemplateElement.prototype.createInstance = createInstance;
}
