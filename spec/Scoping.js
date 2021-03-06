describe('Scope isolation', () => {
  let loader = null;
  const processAsync = function () {
    const c = new noflo.Component();
    c.inPorts.add('in',
      { datatype: 'string' });
    c.outPorts.add('out',
      { datatype: 'string' });

    c.process((input, output) => {
      const data = input.getData('in');
      setTimeout(() => output.sendDone(data + c.nodeId),
        1);
    });
    return c;
  };

  const processMerge = function () {
    const c = new noflo.Component();
    c.inPorts.add('in1',
      { datatype: 'string' });
    c.inPorts.add('in2',
      { datatype: 'string' });
    c.outPorts.add('out',
      { datatype: 'string' });

    c.forwardBrackets = { in1: ['out'] };

    c.process((input, output) => {
      if (!input.has('in1', 'in2', (ip) => ip.type === 'data')) { return; }
      const first = input.getData('in1');
      const second = input.getData('in2');

      output.sendDone({ out: `1${first}:2${second}:${c.nodeId}` });
    });
    return c;
  };

  const processMergeUnscoped = function () {
    const c = new noflo.Component();
    c.inPorts.add('in1',
      { datatype: 'string' });
    c.inPorts.add('in2', {
      datatype: 'string',
      scoped: false,
    });
    c.outPorts.add('out',
      { datatype: 'string' });

    c.forwardBrackets = { in1: ['out'] };

    c.process((input, output) => {
      if (!input.has('in1', 'in2', (ip) => ip.type === 'data')) { return; }
      const first = input.getData('in1');
      const second = input.getData('in2');

      output.sendDone({ out: `1${first}:2${second}:${c.nodeId}` });
    });
    return c;
  };

  const processUnscope = function () {
    const c = new noflo.Component();
    c.inPorts.add('in',
      { datatype: 'string' });
    c.outPorts.add('out', {
      datatype: 'string',
      scoped: false,
    });

    c.process((input, output) => {
      const data = input.getData('in');
      setTimeout(() => {
        output.sendDone(data + c.nodeId);
      },
      1);
    });
    return c;
  };

  // Merge with an addressable port
  const processMergeA = function () {
    const c = new noflo.Component();
    c.inPorts.add('in1',
      { datatype: 'string' });
    c.inPorts.add('in2', {
      datatype: 'string',
      addressable: true,
    });
    c.outPorts.add('out',
      { datatype: 'string' });

    c.forwardBrackets = { in1: ['out'] };

    c.process((input, output) => {
      if (!input.hasData('in1', ['in2', 0], ['in2', 1])) { return; }
      const first = input.getData('in1');
      const second0 = input.getData(['in2', 0]);
      const second1 = input.getData(['in2', 1]);

      output.sendDone({ out: `1${first}:2${second0}:2${second1}:${c.nodeId}` });
    });
    return c;
  };

  before(() => {
    loader = new noflo.ComponentLoader(baseDir);
    return loader.listComponents()
      .then(() => {
        loader.registerComponent('process', 'Async', processAsync);
        loader.registerComponent('process', 'Merge', processMerge);
        loader.registerComponent('process', 'MergeA', processMergeA);
        loader.registerComponent('process', 'Unscope', processUnscope);
        loader.registerComponent('process', 'MergeUnscoped', processMergeUnscoped);
      });
  });
  describe('pure Process API merging two inputs', () => {
    let c = null;
    let in1 = null;
    let in2 = null;
    let out = null;
    before(() => {
      const fbpData = 'INPORT=Pc1.IN:IN1\n'
            + 'INPORT=Pc2.IN:IN2\n'
            + 'OUTPORT=PcMerge.OUT:OUT\n'
            + 'Pc1(process/Async) OUT -> IN1 PcMerge(process/Merge)\n'
            + 'Pc2(process/Async) OUT -> IN2 PcMerge(process/Merge)';
      return noflo.graph.loadFBP(fbpData)
        .then((g) => {
          loader.registerComponent('scope', 'Merge', g);
          return loader.load('scope/Merge');
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          in2 = noflo.internalSocket.createSocket();
          c.inPorts.in2.attach(in2);
          return c.start();
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
    });
    it('should forward new-style brackets as expected', (done) => {
      const expected = [
        'CONN',
        '< 1',
        '< a',
        'DATA 1bazPc1:2fooPc2:PcMerge',
        '>',
        '>',
        'DISC',
      ];
      const received = [];

      out.on('connect', () => {
        received.push('CONN');
      });
      out.on('begingroup', (group) => {
        received.push(`< ${group}`);
      });
      out.on('data', (data) => {
        received.push(`DATA ${data}`);
      });
      out.on('endgroup', () => {
        received.push('>');
      });
      out.on('disconnect', () => {
        received.push('DISC');
        chai.expect(received).to.eql(expected);
        done();
      });

      in2.connect();
      in2.send('foo');
      in2.disconnect();
      in1.connect();
      in1.beginGroup(1);
      in1.beginGroup('a');
      in1.send('baz');
      in1.endGroup();
      in1.endGroup();
      in1.disconnect();
    });
    it('should forward new-style brackets as expected regardless of sending order', (done) => {
      const expected = [
        'CONN',
        '< 1',
        '< a',
        'DATA 1bazPc1:2fooPc2:PcMerge',
        '>',
        '>',
        'DISC',
      ];
      const received = [];

      out.on('connect', () => {
        received.push('CONN');
      });
      out.on('begingroup', (group) => {
        received.push(`< ${group}`);
      });
      out.on('data', (data) => {
        received.push(`DATA ${data}`);
      });
      out.on('endgroup', () => {
        received.push('>');
      });
      out.on('disconnect', () => {
        received.push('DISC');
        chai.expect(received).to.eql(expected);
        done();
      });

      in1.connect();
      in1.beginGroup(1);
      in1.beginGroup('a');
      in1.send('baz');
      in1.endGroup();
      in1.endGroup();
      in1.disconnect();
      in2.connect();
      in2.send('foo');
      in2.disconnect();
    });
    it('should forward scopes as expected', (done) => {
      const expected = [
        'x < 1',
        'x DATA 1onePc1:2twoPc2:PcMerge',
        'x >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });

      in2.post(new noflo.IP('data', 'two',
        { scope: 'x' }));
      in1.post(new noflo.IP('openBracket', 1,
        { scope: 'x' }));
      in1.post(new noflo.IP('data', 'one',
        { scope: 'x' }));
      in1.post(new noflo.IP('closeBracket', 1,
        { scope: 'x' }));
    });
    it('should not forward when scopes don\'t match', (done) => {
      out.on('ip', (ip) => {
        throw new Error(`Received unexpected ${ip.type} packet`);
      });
      c.network.once('end', () => {
        done();
      });
      in2.post(new noflo.IP('data', 'two', { scope: 2 }));
      in1.post(new noflo.IP('openBracket', 1, { scope: 1 }));
      in1.post(new noflo.IP('data', 'one', { scope: 1 }));
      in1.post(new noflo.IP('closeBracket', 1, { scope: 1 }));
    });
  });
  describe('Process API with IIPs and scopes', () => {
    let c = null;
    let in1 = null;
    let out = null;
    before(() => {
      const fbpData = 'INPORT=Pc1.IN:IN1\n'
                    + 'OUTPORT=PcMerge.OUT:OUT\n'
                    + 'Pc1(process/Async) -> IN1 PcMerge(process/Merge)\n'
                    + '\'twoIIP\' -> IN2 PcMerge(process/Merge)';
      return noflo.graph.loadFBP(fbpData)
        .then((g) => {
          loader.registerComponent('scope', 'MergeIIP', g);
          return loader.load('scope/MergeIIP');
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          return c.start();
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
    });
    it('should forward scopes as expected', (done) => {
      const expected = [
        'x < 1',
        'x DATA 1onePc1:2twoIIP:PcMerge',
        'x >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });

      in1.post(new noflo.IP('openBracket', 1, { scope: 'x' }));
      in1.post(new noflo.IP('data', 'one', { scope: 'x' }));
      in1.post(new noflo.IP('closeBracket', 1, { scope: 'x' }));
    });
  });
  describe('Process API with unscoped inport and scopes', () => {
    let c = null;
    let in1 = null;
    let in2 = null;
    let out = null;
    before(() => {
      const fbpData = 'INPORT=Pc1.IN:IN1\n'
                    + 'INPORT=Pc2.IN:IN2\n'
                    + 'OUTPORT=PcMerge.OUT:OUT\n'
                    + 'Pc1(process/Async) -> IN1 PcMerge(process/MergeUnscoped)\n'
                    + 'Pc2(process/Async) -> IN2 PcMerge(process/MergeUnscoped)';
      return noflo.graph
        .loadFBP(fbpData)
        .then((g) => {
          loader.registerComponent('scope', 'MergeUnscoped', g);
          return loader.load('scope/MergeUnscoped');
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          in2 = noflo.internalSocket.createSocket();
          c.inPorts.in2.attach(in2);
          return c.setUp();
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
    });
    it('should forward scopes as expected', (done) => {
      const expected = [
        'x < 1',
        'x DATA 1onePc1:2twoPc2:PcMerge',
        'x >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });

      in1.post(new noflo.IP('openBracket', 1, { scope: 'x' }));
      in1.post(new noflo.IP('data', 'one', { scope: 'x' }));
      in1.post(new noflo.IP('closeBracket', 1, { scope: 'x' }));
      in2.post(new noflo.IP('openBracket', 1, { scope: 'x' }));
      in2.post(new noflo.IP('data', 'two', { scope: 'x' }));
      in2.post(new noflo.IP('closeBracket', 1, { scope: 'x' }));
    });
    it('should forward packets without scopes', (done) => {
      const expected = [
        'null < 1',
        'null DATA 1onePc1:2twoPc2:PcMerge',
        'null >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });
      in1.post(new noflo.IP('openBracket', 1));
      in1.post(new noflo.IP('data', 'one'));
      in1.post(new noflo.IP('closeBracket'));
      in2.post(new noflo.IP('openBracket', 1));
      in2.post(new noflo.IP('data', 'two'));
      in2.post(new noflo.IP('closeBracket', 1));
    });
    it('should forward scopes also on unscoped packet', (done) => {
      const expected = [
        'x < 1',
        'x DATA 1onePc1:2twoPc2:PcMerge',
        'x >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });
      in2.post(new noflo.IP('openBracket', 1));
      in2.post(new noflo.IP('data', 'two'));
      in2.post(new noflo.IP('closeBracket', 1));
      in1.post(new noflo.IP('openBracket', 1, { scope: 'x' }));
      in1.post(new noflo.IP('data', 'one', { scope: 'x' }));
      in1.post(new noflo.IP('closeBracket', 1, { scope: 'x' }));
    });
  });
  describe('Process API with unscoped outport and scopes', () => {
    let c = null;
    let in1 = null;
    let in2 = null;
    let out = null;
    before(() => {
      const fbpData = 'INPORT=Pc1.IN:IN1\n'
                    + 'INPORT=Pc2.IN:IN2\n'
                    + 'OUTPORT=PcMerge.OUT:OUT\n'
                    + 'Pc1(process/Unscope) -> IN1 PcMerge(process/Merge)\n'
                    + 'Pc2(process/Unscope) -> IN2 PcMerge';
      return noflo.graph
        .loadFBP(fbpData)
        .then((g) => {
          loader.registerComponent('scope', 'MergeUnscopedOut', g);
          return loader.load('scope/MergeUnscopedOut');
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          in2 = noflo.internalSocket.createSocket();
          c.inPorts.in2.attach(in2);
          return c.setUp();
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
    });
    it('should remove scopes as expected', (done) => {
      const expected = [
        'null < 1',
        'null DATA 1onePc1:2twoPc2:PcMerge',
        'null >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });

      in1.post(new noflo.IP('openBracket', 1, { scope: 'x' }));
      in1.post(new noflo.IP('data', 'one', { scope: 'x' }));
      in1.post(new noflo.IP('closeBracket', 1, { scope: 'x' }));
      in2.post(new noflo.IP('openBracket', 1, { scope: 'y' }));
      in2.post(new noflo.IP('data', 'two', { scope: 'y' }));
      in2.post(new noflo.IP('closeBracket', 1, { scope: 'y' }));
    });
    it('should forward packets without scopes', (done) => {
      const expected = [
        'null < 1',
        'null DATA 1onePc1:2twoPc2:PcMerge',
        'null >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });
      in1.post(new noflo.IP('openBracket', 1));
      in1.post(new noflo.IP('data', 'one'));
      in1.post(new noflo.IP('closeBracket'));
      in2.post(new noflo.IP('openBracket', 1));
      in2.post(new noflo.IP('data', 'two'));
      in2.post(new noflo.IP('closeBracket', 1));
    });
    it('should remove scopes also on unscoped packet', (done) => {
      const expected = [
        'null < 1',
        'null DATA 1onePc1:2twoPc2:PcMerge',
        'null >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });
      in1.post(new noflo.IP('openBracket', 1, { scope: 'x' }));
      in1.post(new noflo.IP('data', 'one', { scope: 'x' }));
      in1.post(new noflo.IP('closeBracket', 1, { scope: 'x' }));
      in2.post(new noflo.IP('openBracket', 1));
      in2.post(new noflo.IP('data', 'two'));
      in2.post(new noflo.IP('closeBracket', 1));
    });
  });
  describe('Process API with IIPs to addressable ports and scopes', () => {
    let c = null;
    let in1 = null;
    let out = null;
    before(() => {
      const fbpData = 'INPORT=Pc1.IN:IN1\n'
                    + 'OUTPORT=PcMergeA.OUT:OUT\n'
                    + 'Pc1(process/Async) -> IN1 PcMergeA(process/MergeA)\n'
                    + '\'twoIIP0\' -> IN2[0] PcMergeA\n'
                    + '\'twoIIP1\' -> IN2[1] PcMergeA';
      return noflo.graph
        .loadFBP(fbpData)
        .then((g) => {
          loader.registerComponent('scope', 'MergeIIPA', g);
          return loader.load('scope/MergeIIPA');
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          return c.setUp();
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
    });
    it('should forward scopes as expected', (done) => {
      const expected = [
        'x < 1',
        'x DATA 1onePc1:2twoIIP0:2twoIIP1:PcMergeA',
        'x >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            if (brackets.length) { return; }
            chai.expect(received).to.eql(expected);
            done();
            break;
        }
      });

      in1.post(new noflo.IP('openBracket', 1, { scope: 'x' }));
      in1.post(new noflo.IP('data', 'one', { scope: 'x' }));
      in1.post(new noflo.IP('closeBracket', 1, { scope: 'x' }));
    });
  });
});
