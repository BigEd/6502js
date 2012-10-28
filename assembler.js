/*
*  6502 assembler and simulator in Javascript
*  (C)2006-2010 Stian Soreng - www.6502asm.com
*
*  Adapted by Nick Morgan
*  https://github.com/skilldrick/6502js
*
*  Generalised and extended by Ed Spittles
*  https://github.com/BigEd/6502js
*
*  Released under the GNU General Public License
*  see http://gnu.org/licenses/gpl.html
*/


function SimulatorWidget(node) {
  var $node = $(node);
  var ui = UI();
  var display = Display();
  var memory = Memory();
  var labels = Labels();
  var simulator = Simulator();
  var assembler = Assembler();

  function initialize() {
    stripText();
    ui.initialize();
    display.initialize();
    simulator.reset();

    $node.find('.assembleButton').click(function () {
      assembler.assembleCode();
    });
    $node.find('.runButton').click(simulator.runBinary);
    $node.find('.runButton').click(simulator.stopDebugger);
    $node.find('.resetButton').click(simulator.reset);
    $node.find('.hexdumpButton').click(assembler.hexdump);
    $node.find('.disassembleButton').click(assembler.disassemble);
    $node.find('.debug').change(function () {
      var debug = $(this).is(':checked');
      if (debug) {
        ui.debugOn();
        simulator.enableDebugger();
      } else {
        ui.debugOff();
        simulator.stopDebugger();
      }
    });
    $node.find('.monitoring').change(function () {
      ui.toggleMonitor();
      simulator.toggleMonitor();
    });
    $node.find('.stepButton').click(simulator.debugExec);
    $node.find('.gotoButton').click(simulator.gotoAddr);
    $node.find('.modeSwitches').change(function () {
      var dw = parseInt($("input[@name=dataWidth]:checked").val());
      simulator.updateDw(dw);
      simulator.reset();
    });
    $node.find('.notesButton').click(ui.showNotes);
    $node.find('.code').keypress(simulator.stop);
    $node.find('.code').keypress(ui.initialize);
    $(document).keypress(memory.storeKeypress);
  }

  function stripText() {
    //Remove leading and trailing space in textarea
    var text = $node.find('.code').val();
    text = text.replace(/^\n+/, '').replace(/\s+$/, '');
    $node.find('.code').val(text);
  }

  function UI() {
    var currentState;

    var start = {
      assemble: true,
      run: [false, 'Run'],
      reset: false,
      hexdump: false,
      disassemble: false,
      debug: [false, false]
    };
    var assembled = {
      assemble: false,
      run: [true, 'Run'],
      reset: true,
      hexdump: true,
      disassemble: true,
      debug: [true, false]
    };
    var running = {
      assemble: false,
      run: [true, 'Stop'],
      reset: true,
      hexdump: false,
      disassemble: false,
      debug: [true, false]
    };
    var debugging = {
      assemble: false,
      reset: true,
      hexdump: true,
      disassemble: true,
      debug: [true, true]
    };
    var postDebugging = {
      assemble: false,
      reset: true,
      hexdump: true,
      disassemble: true,
      debug: [true, false]
    };


    function setState(state) {
      $node.find('.assembleButton').attr('disabled', !state.assemble);
      if (state.run) {
        $node.find('.runButton').attr('disabled', !state.run[0]);
        $node.find('.runButton').val(state.run[1]);
      }
      $node.find('.resetButton').attr('disabled', !state.reset);
      $node.find('.hexdumpButton').attr('disabled', !state.hexdump);
      $node.find('.disassembleButton').attr('disabled', !state.disassemble);
      $node.find('.debug').attr('disabled', !state.debug[0]);
      $node.find('.debug').attr('checked', state.debug[1]);
      $node.find('.stepButton').attr('disabled', !state.debug[1]);
      $node.find('.gotoButton').attr('disabled', !state.debug[1]);
      currentState = state;
    }

    function initialize() {
      setState(start);
    }

    function play() {
      setState(running);
    }

    function stop() {
      setState(assembled);
    }

    function debugOn() {
      setState(debugging);
    }

    function debugOff() {
      setState(postDebugging);
    }

    function assembleSuccess() {
      setState(assembled);
    }

    function toggleMonitor() {
      $node.find('.monitor').toggle();
    }

    function showNotes() {
      $node.find('.messages code').html($node.find('.notes').html());
    }

    return {
      initialize: initialize,
      play: play,
      stop: stop,
      assembleSuccess: assembleSuccess,
      debugOn: debugOn,
      debugOff: debugOff,
      toggleMonitor: toggleMonitor,
      showNotes: showNotes
    };
  }


  function Display() {
    var displayArray = [];
    var palette = [
      "#000000", "#ffffff", "#880000", "#aaffee",
      "#cc44cc", "#00cc55", "#0000aa", "#eeee77",
      "#dd8855", "#664400", "#ff7777", "#333333",
      "#777777", "#aaff66", "#0088ff", "#bbbbbb"
    ];
    var ctx;
    var width;
    var height;
    var pixelSize;
    var numX = 32;
    var numY = 32;

    function initialize() {
      var canvas = $node.find('.screen')[0];
      width = canvas.width;
      height = canvas.height;
      pixelSize = width / numX;
      ctx = canvas.getContext('2d');
      reset();
    }

    function reset() {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
    }

    function updatePixel(addr) {
      ctx.fillStyle = palette[memory.get(addr) & 0x0f];
      var y = Math.floor((addr - 0x200) / 32);
      var x = (addr - 0x200) % 32;
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }

    return {
      initialize: initialize,
      reset: reset,
      updatePixel: updatePixel
    };
  }

  function Memory() {
    var memArray = new Array(0x600);

    function set(addr, val) {
      return memArray[addr] = val;
    }

    function get(addr) {
      return memArray[addr];
    }

    function getWord(addr) {
      return get(addr) + (get(addr + 1) << 8);
    }

    // storeByte() - Poke a byte, don't touch any registers

    function storeByte(addr, value) {
      set(addr, value & simulator.dm);
      if ((addr >= 0x200) && (addr <= 0x5ff)) {
        display.updatePixel(addr);
      }
    }

    // storeKeypress() - Store keycode in ZP $ff
    function storeKeypress(e) {
      value = e.which;
      memory.storeByte(0xff, value);
    }

    function format(start, length) {
      var html = '';
      var n;

      for (var x = 0; x < length; x++) {
        if ((x & 15) === 0) {
          if (x > 0) { html += "\n"; }
          n = (start + x);
          html += addr2hex(n);
          html += ": ";
        }
        html += num2hex(memory.get(start + x));
        html += " ";
      }
      return html;
    }

    return {
      set: set,
      get: get,
      getWord: getWord,
      storeByte: storeByte,
      storeKeypress: storeKeypress,
      format: format
    };
  }

  function Simulator() {
    var regA = 0;
    var regX = 0;
    var regY = 0;
    var regP = 0;
    var regPC = 0x600;
    var regSP = 0xff;
    var codeRunning = false;
    var debug = false;
    var monitoring = false;
    var executeId;

    // supporting various data bus sizes for 6502, 65Org16 and 65Org32
    var dw, aw, dm, am, ms;

    function updateDw(w){
      simulator.dw = w;           // data bus, register and accumulator width
      var aw = (w>16) ? w : w*2;  // address bus and program counter width
      simulator.aw = aw;
      // 32-bit widths are a little delicate in javascript
      simulator.dm = (1<<w)-1;    // data mask
      simulator.am = 4*(1<<(aw-2))-1;   // address mask
      simulator.ms = 4*(1<<(aw-2))-1;   // memory size mask (highest memory address)
    }

    //set zero and negative processor flags based on result
    function setNVflags(value) {
      if (value) {
        regP &= ~0x02;
      } else {
        regP |= 0x02;
      }
      var signbit=2*(1<<(simulator.dw-2)) // same as 1<<(dw-1) even for dw==32
      if (value & signbit) {
        regP |= signbit;
      } else {
        regP &= ~signbit;
      }
    }

    function setCarryFlagFromBit0(value) {
      regP = (regP & ~1) | (value & 1);
    }

    function setCarryFlagFromBit7(value) {
      regP = (regP & ~1) | ((value >> (simulator.dw-1)) & 1);
    }

    function setNVflagsForRegA() {
      setNVflags(regA);
    }

    function setNVflagsForRegX() {
      setNVflags(regX);
    }

    function setNVflagsForRegY() {
      setNVflags(regY);
    }

    var ORA = setNVflagsForRegA;
    var AND = setNVflagsForRegA;
    var EOR = setNVflagsForRegA;
    var ASL = setNVflags;
    var LSR = setNVflags;
    var ROL = setNVflags;
    var ROR = setNVflags;
    var LDA = setNVflagsForRegA;
    var LDX = setNVflagsForRegX;
    var LDY = setNVflagsForRegY;

    function BIT(value) {
      var signbit = 2*(1<<(simulator.dw-2)) // same as 1<<(dw-1) even for dw==32
      if (value & signbit) {
        regP |= signbit;
      } else {
        regP &= ~signbit;   
      }
      var vbit = signbit/2;
      if (value & vbit) {
        regP |= vbit;
      } else {
        regP &= ~vbit;
      }
      if (regA & value) {
        regP &= ~0x02;
      } else {
        regP |= 0x02;
      }
    }

    function CLC() {
      regP &= ~1;
    }

    function SEC() {
      regP |= 1;
    }


    function CLV() {
      regP &= ~(1<<(simulator.dw-2));
    }

    function setOverflow() {
      regP |= 1<<(simulator.dw-2);
    }

    function DEC(addr) {
      var value = memory.get(addr);
      value!=0 ? value-- : value=simulator.dm;  // cannot simply decrement and mask in 32bit case
      memory.storeByte(addr, value);
      setNVflags(value);
    }

    function INC(addr) {
      var value = memory.get(addr);
      value==simulator.dm ? value=0 : value++;  // cannot simply increment and mask in 32bit case
      memory.storeByte(addr, value);
      setNVflags(value);
    }

    function jumpBranch(offset) {
      regPC += offset;
      if (offset > simulator.dm/2) {
        regPC -= 1 + simulator.dm;
      }
    }

    function overflowSet() {
      return regP & 1<<(simulator.dw-2);
    }

    function decimalMode() {
      return regP & 8;
    }

    function carrySet() {
      return regP & 1;
    }

    function negativeSet() {
      return regP & 2*(1<<(simulator.dw-2)) // sign bit, same as 1<<(dw-1) even for dw==32;
    }

    function zeroSet() {
      return regP & 0x02;
    }

    function doCompare(reg, val) {
      if (reg >= val) {
        SEC();
      } else {
        CLC();
      }
      val = (reg - val);
      setNVflags(val);
    }

    function testSBC(value) {
      var tmp, w;
      var signbit = 2*(1<<(simulator.dw-2)) // same as 1<<(dw-1) even for dw==32
      if ((regA ^ value) & signbit) {
        setOverflow();
      } else {
        CLV();
      }

      if (decimalMode()) {
        tmp = 0xf + (regA & 0xf) - (value & 0xf) + carrySet();
        if (tmp < 0x10) {
          w = 0;
          tmp -= 6;
        } else {
          w = 0x10;
          tmp -= 0x10;
        }
        w += 0xf0 + (regA & 0xf0) - (value & 0xf0);
        if (w < 0x100) {
          CLC();
          if (overflowSet() && w < 0x80) { CLV(); }
          w -= 0x60;
        } else {
          SEC();
          if (overflowSet() && w >= 0x180) { CLV(); }
        }
        w += tmp;
      } else {
        w = simulator.dm + regA - value + carrySet();
        if (w < 1+simulator.dm) {
          CLC();
          if (overflowSet() && w < signbit) { CLV(); }
        } else {
          SEC();
          if (overflowSet() && w >= (3*signbit)) { CLV(); }
        }
      }
      regA = w & simulator.dm;
      setNVflagsForRegA();
    }

    function testADC(value) {
      var tmp;
      var signbit = 2*(1<<(simulator.dw-2)) // same as 1<<(dw-1) even for dw==32
      if ((regA ^ value) & signbit) {
        CLV();
      } else {
        setOverflow();
      }

      if (decimalMode()) {
        tmp = (regA & 0xf) + (value & 0xf) + carrySet();
        if (tmp >= 10) {
          tmp = 0x10 | ((tmp + 6) & 0xf);
        }
        tmp += (regA & 0xf0) + (value & 0xf0);
        if (tmp >= 160) {
          SEC();
          if (overflowSet() && tmp >= 0x180) { CLV(); }
          tmp += 0x60;
        } else {
          CLC();
          if (overflowSet() && tmp < 0x80) { CLV(); }
        }
      } else {
        tmp = regA + value + carrySet();
        if (tmp >= 2*signbit) {
          SEC();
          if (overflowSet() && tmp >= 3*signbit) { CLV(); }
        } else {
          CLC();
          if (overflowSet() && tmp < signbit) { CLV(); }
        }
      }
      regA = tmp & simulator.dm;
      setNVflagsForRegA();
    }

    var instructions = {
      i00: function () {
        codeRunning = false;
        //BRK
      },

      i01: function () {
        var zp = (popByte() + regX) & simulator.dm;
        var addr = memory.getWord(zp);
        var value = memory.get(addr);
        regA |= value;
        ORA();
      },

      i05: function () {
        var zp = popByte();
        regA |= memory.get(zp);
        ORA();
      },

      i06: function () {
        var zp = popByte();
        var value = memory.get(zp);
        setCarryFlagFromBit7(value);
        value = value << 1;
        memory.storeByte(zp, value);
        ASL(value);
      },

      i08: function () {
        stackPush(regP | 0x30);
        //PHP
      },

      i09: function () {
        regA |= popByte();
        ORA();
      },

      i0a: function () {
        setCarryFlagFromBit7(regA);
        regA = (regA << 1) & simulator.dm;
        ASL(regA);
      },

      i0d: function () {
        regA |= memory.get(popWord());
        ORA();
      },

      i0e: function () {
        var addr = popWord();
        var value = memory.get(addr);
        setCarryFlagFromBit7(value);
        value += value;
        memory.storeByte(addr, value);
        ASL(value);
      },

      i10: function () {
        var offset = popByte();
        if (!negativeSet()) { jumpBranch(offset); }
        //BPL
      },

      i11: function () {
        var zp = popByte();
        var value = memory.getWord(zp) + regY;
        regA |= memory.get(value);
        ORA();
      },

      i15: function () {
        var addr = (popByte() + regX) & simulator.dm;
        regA |= memory.get(addr);
        ORA();
      },

      i16: function () {
        var addr = (popByte() + regX) & simulator.dm;
        var value = memory.get(addr);
        setCarryFlagFromBit7(value);
        value += value;
        memory.storeByte(addr, value);
        ASL(value);
      },

      i18: function () {
        CLC();
      },

      i19: function () {
        var addr = popWord() + regY;
        regA |= memory.get(addr);
        ORA();
      },

      i1d: function () {
        var addr = popWord() + regX;
        regA |= memory.get(addr);
        ORA();
      },

      i1e: function () {
        var addr = popWord() + regX;
        var value = memory.get(addr);
        setCarryFlagFromBit7(value);
        value += value;
        memory.storeByte(addr, value);
        ASL(value);
      },

      i20: function () {
        var addr = popWord();
        var currAddr = regPC - 1;
        if (simulator.dw<32)
          stackPush(((currAddr >> simulator.dw) & simulator.dm));
        stackPush((currAddr & simulator.dm));
        regPC = addr;
        //JSR
      },

      i21: function () {
        var zp = (popByte() + regX) & simulator.dm;
        var addr = memory.getWord(zp);
        var value = memory.get(addr);
        regA &= value;
        AND();
      },

      i24: function () {
        var zp = popByte();
        var value = memory.get(zp);
        BIT(value);
      },

      i25: function () {
        var zp = popByte();
        regA &= memory.get(zp);
        AND();
      },

      i26: function () {
        var sf = carrySet();
        var addr = popByte();
        var value = memory.get(addr);
        setCarryFlagFromBit7(value);
        value += value;
        value |= sf;
        memory.storeByte(addr, value);
        ROL(value);
      },

      i28: function () {
        regP = stackPop() | 0x30; // There is no B bit!
        //PLP
      },

      i29: function () {
        regA &= popByte();
        AND();
      },

      i2a: function () {
        var sf = carrySet();
        setCarryFlagFromBit7(regA);
        regA += regA;
        regA &= simulator.dm;
        regA |= sf;
        ROL(regA);
      },

      i2c: function () {
        var value = memory.get(popWord());
        BIT(value);
      },

      i2d: function () {
        var value = memory.get(popWord());
        regA &= value;
        AND();
      },

      i2e: function () {
        var sf = carrySet();
        var addr = popWord();
        var value = memory.get(addr);
        setCarryFlagFromBit7(value);
        value += value;
        value |= sf;
        memory.storeByte(addr, value);
        ROL(value);
      },

      i30: function () {
        var offset = popByte();
        if (negativeSet()) { jumpBranch(offset); }
        //BMI
      },

      i31: function () {
        var zp = popByte();
        var value = memory.getWord(zp) + regY;
        regA &= memory.get(value);
        AND();
      },

      i35: function () {
        var addr = (popByte() + regX) & simulator.dm;
        regA &= memory.get(addr);
        AND();
      },

      i36: function () {
        var sf = carrySet();
        var addr = (popByte() + regX) & simulator.dm;
        var value = memory.get(addr);
        setCarryFlagFromBit7(value);
        value += value;
        value |= sf;
        memory.storeByte(addr, value);
        ROL(value);
      },

      i38: function () {
        SEC();
      },

      i39: function () {
        var addr = popWord() + regY;
        var value = memory.get(addr);
        regA &= value;
        AND();
      },

      i3d: function () {
        var addr = popWord() + regX;
        var value = memory.get(addr);
        regA &= value;
        AND();
      },

      i3e: function () {
        var sf = carrySet();
        var addr = popWord() + regX;
        var value = memory.get(addr);
        setCarryFlagFromBit7(value);
        value += value;
        value |= sf;
        memory.storeByte(addr, value);
        ROL(value);
      },

      i40: function () {
        regP = stackPop() | 0x30; // There is no B bit!
        regPC = stackPop();
        if (simulator.dw<32)
          regPC |= stackPop() << simulator.dw;
        //RTI
      },

      i41: function () {
        var zp = (popByte() + regX) & simulator.dm;
        var value = memory.getWord(zp);
        regA ^= memory.get(value);
        EOR();
      },

      i45: function () {
        var addr = popByte() & simulator.dm;
        var value = memory.get(addr);
        regA ^= value;
        EOR();
      },

      i46: function () {
        var addr = popByte() & simulator.dm;
        var value = memory.get(addr);
        setCarryFlagFromBit0(value);
        value /= 2; // right shifting a negative 32-bit int gives a negative result
        value |= 0; // remove fractional part
        memory.storeByte(addr, value);
        LSR(value);
      },

      i48: function () {
        stackPush(regA);
        //PHA
      },

      i49: function () {
        regA ^= popByte();
        EOR();
      },

      i4a: function () {
        setCarryFlagFromBit0(regA);
        regA /= 2; // right shifting a negative 32-bit int gives a negative result
        regA |= 0; // remove fractional part
        LSR(regA);
      },

      i4c: function () {
        regPC = popWord();
        //JMP
      },

      i4d: function () {
        var addr = popWord();
        var value = memory.get(addr);
        regA ^= value;
        EOR();
      },

      i4e: function () {
        var addr = popWord();
        var value = memory.get(addr);
        setCarryFlagFromBit0(value);
        value /= 2; // right shifting a negative 32-bit int gives a negative result
        value |= 0; // remove fractional part
        memory.storeByte(addr, value);
        LSR(value);
      },

      i50: function () {
        var offset = popByte();
        if (!overflowSet()) { jumpBranch(offset); }
        //BVC
      },

      i51: function () {
        var zp = popByte();
        var value = memory.getWord(zp) + regY;
        regA ^= memory.get(value);
        EOR();
      },

      i55: function () {
        var addr = (popByte() + regX) & simulator.dm;
        regA ^= memory.get(addr);
        EOR();
      },

      i56: function () {
        var addr = (popByte() + regX) & simulator.dm;
        var value = memory.get(addr);
        setCarryFlagFromBit0(value);
        value /= 2; // right shifting a negative 32-bit int gives a negative result
        value |= 0; // remove fractional part
        memory.storeByte(addr, value);
        LSR(value);
      },

      i58: function () {
        regP &= ~0x04;
        throw new Error("Interrupts not implemented");
        //CLI
      },

      i59: function () {
        var addr = popWord() + regY;
        var value = memory.get(addr);
        regA ^= value;
        EOR();
      },

      i5d: function () {
        var addr = popWord() + regX;
        var value = memory.get(addr);
        regA ^= value;
        EOR();
      },

      i5e: function () {
        var addr = popWord() + regX;
        var value = memory.get(addr);
        setCarryFlagFromBit0(value);
        value /= 2; // right shifting a negative 32-bit int gives a negative result
        value |= 0; // remove fractional part
        memory.storeByte(addr, value);
        LSR(value);
      },

      i60: function () {
        regPC = stackPop();
        if (simulator.dw<32)
          regPC |= stackPop() << simulator.dw;
        regPC += 1;
        //RTS
      },

      i61: function () {
        var zp = (popByte() + regX) & simulator.dm;
        var addr = memory.getWord(zp);
        var value = memory.get(addr);
        testADC(value);
        //ADC
      },

      i65: function () {
        var addr = popByte();
        var value = memory.get(addr);
        testADC(value);
        //ADC
      },

      i66: function () {
        var sf = carrySet();
        var addr = popByte();
        var value = memory.get(addr);
        setCarryFlagFromBit0(value);
        value /= 2; // right shifting a negative 32-bit int gives a negative result
        value |= 0; // remove fractional part 
        if (sf) { value |= 2*(1<<(simulator.dw-2)); } // sign bit, same as 1<<(dw-1) even for dw==32
        memory.storeByte(addr, value);
        ROR(value);
      },

      i68: function () {
        regA = stackPop();
        setNVflagsForRegA();
        //PLA
      },

      i69: function () {
        var value = popByte();
        testADC(value);
        //ADC
      },

      i6a: function () {
        var sf = carrySet();
        setCarryFlagFromBit0(regA);
        regA /= 2; // right shifting a negative 32-bit int gives a negative result
        regA |= 0; // remove fractional part
        if (sf) { regA |= 2*(1<<(simulator.dw-2)); } // sign bit, same as 1<<(dw-1) even for dw==32
        ROR(regA);
      },

      i6c: function () {
        regPC = memory.getWord(popWord());
        //JMP
      },

      i6d: function () {
        var addr = popWord();
        var value = memory.get(addr);
        testADC(value);
        //ADC
      },

      i6e: function () {
        var sf = carrySet();
        var addr = popWord();
        var value = memory.get(addr);
        setCarryFlagFromBit0(value);
        value /= 2; // right shifting a negative 32-bit int gives a negative result
        value |= 0; // remove fractional part
        if (sf) { value |= 2*(1<<(simulator.dw-2)); } // sign bit, same as 1<<(dw-1) even for dw==32
        memory.storeByte(addr, value);
        ROR(value);
      },

      i70: function () {
        var offset = popByte();
        if (overflowSet()) { jumpBranch(offset); }
        //BVS
      },

      i71: function () {
        var zp = popByte();
        var addr = memory.getWord(zp);
        var value = memory.get(addr + regY);
        testADC(value);
        //ADC
      },

      i75: function () {
        var addr = (popByte() + regX) & simulator.dm;
        var value = memory.get(addr);
        testADC(value);
        //ADC
      },

      i76: function () {
        var sf = carrySet();
        var addr = (popByte() + regX) & simulator.dm;
        var value = memory.get(addr);
        setCarryFlagFromBit0(value);
        value /= 2; // right shifting a negative 32-bit int gives a negative result
        value |= 0; // remove fractional part
        if (sf) { value |= 2*(1<<(simulator.dw-2)); } // sign bit, same as 1<<(dw-1) even for dw==32
        memory.storeByte(addr, value);
        ROR(value);
      },

      i78: function () {
        regP |= 0x04;
        throw new Error("Interrupts not implemented");
        //SEI
      },

      i79: function () {
        var addr = popWord();
        var value = memory.get(addr + regY);
        testADC(value);
        //ADC
      },

      i7d: function () {
        var addr = popWord();
        var value = memory.get(addr + regX);
        testADC(value);
        //ADC
      },

      i7e: function () {
        var sf = carrySet();
        var addr = popWord() + regX;
        var value = memory.get(addr);
        setCarryFlagFromBit0(value);
        value /= 2; // right shifting a negative 32-bit int gives a negative result
        value |= 0; // remove fractional part
        if (sf) { value |= 2*(1<<(simulator.dw-2)); } // sign bit, same as 1<<(dw-1) even for dw==32
        memory.storeByte(addr, value);
        ROR(value);
      },

      i81: function () {
        var zp = (popByte() + regX) & simulator.dm;
        var addr = memory.getWord(zp);
        memory.storeByte(addr, regA);
        //STA
      },

      i84: function () {
        memory.storeByte(popByte(), regY);
        //STY
      },

      i85: function () {
        memory.storeByte(popByte(), regA);
        //STA
      },

      i86: function () {
        memory.storeByte(popByte(), regX);
        //STX
      },

      i88: function () {
        regY = (regY - 1) & simulator.dm;
        setNVflagsForRegY();
        //DEY
      },

      i8a: function () {
        regA = regX & simulator.dm;
        setNVflagsForRegA();
        //TXA
      },

      i8c: function () {
        memory.storeByte(popWord(), regY);
        //STY
      },

      i8d: function () {
        memory.storeByte(popWord(), regA);
        //STA
      },

      i8e: function () {
        memory.storeByte(popWord(), regX);
        //STX
      },

      i90: function () {
        var offset = popByte();
        if (!carrySet()) { jumpBranch(offset); }
        //BCC
      },

      i91: function () {
        var zp = popByte();
        var addr = memory.getWord(zp) + regY;
        memory.storeByte(addr, regA);
        //STA
      },

      i94: function () {
        memory.storeByte((popByte() + regX) & simulator.dm, regY);
        //STY
      },

      i95: function () {
        memory.storeByte((popByte() + regX) & simulator.dm, regA);
        //STA
      },

      i96: function () {
        memory.storeByte((popByte() + regY) & simulator.dm, regX);
        //STX
      },

      i98: function () {
        regA = regY & simulator.dm;
        setNVflagsForRegA();
        //TYA
      },

      i99: function () {
        memory.storeByte(popWord() + regY, regA);
        //STA
      },

      i9a: function () {
        regSP = regX & simulator.dm;
        //TXS
      },

      i9d: function () {
        var addr = popWord();
        memory.storeByte(addr + regX, regA);
        //STA
      },

      ia0: function () {
        regY = popByte();
        LDY();
      },

      ia1: function () {
        var zp = (popByte() + regX) & simulator.dm;
        var addr = memory.getWord(zp);
        regA = memory.get(addr);
        LDA();
      },

      ia2: function () {
        regX = popByte();
        LDX();
      },

      ia4: function () {
        regY = memory.get(popByte());
        LDY();
      },

      ia5: function () {
        regA = memory.get(popByte());
        LDA();
      },

      ia6: function () {
        regX = memory.get(popByte());
        LDX();
      },

      ia8: function () {
        regY = regA & simulator.dm;
        setNVflagsForRegY();
        //TAY
      },

      ia9: function () {
        regA = popByte();
        LDA();
      },

      iaa: function () {
        regX = regA & simulator.dm;
        setNVflagsForRegX();
        //TAX
      },

      iac: function () {
        regY = memory.get(popWord());
        LDY();
      },

      iad: function () {
        regA = memory.get(popWord());
        LDA();
      },

      iae: function () {
        regX = memory.get(popWord());
        LDX();
      },

      ib0: function () {
        var offset = popByte();
        if (carrySet()) { jumpBranch(offset); }
        //BCS
      },

      ib1: function () {
        var zp = popByte();
        var addr = memory.getWord(zp) + regY;
        regA = memory.get(addr);
        LDA();
      },

      ib4: function () {
        regY = memory.get((popByte() + regX) & simulator.dm);
        LDY();
      },

      ib5: function () {
        regA = memory.get((popByte() + regX) & simulator.dm);
        LDA();
      },

      ib6: function () {
        regX = memory.get((popByte() + regY) & simulator.dm);
        LDX();
      },

      ib8: function () {
        CLV();
      },

      ib9: function () {
        var addr = popWord() + regY;
        regA = memory.get(addr);
        LDA();
      },

      iba: function () {
        regX = regSP & simulator.dm;
        LDX();
        //TSX
      },

      ibc: function () {
        var addr = popWord() + regX;
        regY = memory.get(addr);
        LDY();
      },

      ibd: function () {
        var addr = popWord() + regX;
        regA = memory.get(addr);
        LDA();
      },

      ibe: function () {
        var addr = popWord() + regY;
        regX = memory.get(addr);
        LDX();
      },

      ic0: function () {
        var value = popByte();
        doCompare(regY, value);
        //CPY
      },

      ic1: function () {
        var zp = (popByte() + regX) & simulator.dm;
        var addr = memory.getWord(zp);
        var value = memory.get(addr);
        doCompare(regA, value);
        //CPA
      },

      ic4: function () {
        var value = memory.get(popByte());
        doCompare(regY, value);
        //CPY
      },

      ic5: function () {
        var value = memory.get(popByte());
        doCompare(regA, value);
        //CPA
      },

      ic6: function () {
        var zp = popByte();
        DEC(zp);
      },

      ic8: function () {
        regY==simulator.dm ? regY=0 : regY++;  // cannot simply increment and mask in 32bit case
        setNVflagsForRegY();
        //INY
      },

      ic9: function () {
        var value = popByte();
        doCompare(regA, value);
        //CMP
      },

      ica: function () {
        regX!=0 ? regX-- : regX=simulator.dm;  // cannot simply decrement and mask in 32bit case
        setNVflagsForRegX();
        //DEX
      },

      icc: function () {
        var value = memory.get(popWord());
        doCompare(regY, value);
        //CPY
      },

      icd: function () {
        var value = memory.get(popWord());
        doCompare(regA, value);
        //CPA
      },

      ice: function () {
        var addr = popWord();
        DEC(addr);
      },

      id0: function () {
        var offset = popByte();
        if (!zeroSet()) { jumpBranch(offset); }
        //BNE
      },

      id1: function () {
        var zp = popByte();
        var addr = memory.getWord(zp) + regY;
        var value = memory.get(addr);
        doCompare(regA, value);
        //CMP
      },

      id5: function () {
        var value = memory.get((popByte() + regX) & simulator.dm);
        doCompare(regA, value);
        //CMP
      },

      id6: function () {
        var addr = (popByte() + regX) & simulator.dm;
        DEC(addr);
      },

      id8: function () {
        regP &= ~0x08;
        //CLD
      },

      id9: function () {
        var addr = popWord() + regY;
        var value = memory.get(addr);
        doCompare(regA, value);
        //CMP
      },

      idd: function () {
        var addr = popWord() + regX;
        var value = memory.get(addr);
        doCompare(regA, value);
        //CMP
      },

      ide: function () {
        var addr = popWord() + regX;
        DEC(addr);
      },

      ie0: function () {
        var value = popByte();
        doCompare(regX, value);
        //CPX
      },

      ie1: function () {
        var zp = (popByte() + regX) & simulator.dm;
        var addr = memory.getWord(zp);
        var value = memory.get(addr);
        testSBC(value);
        //SBC
      },

      ie4: function () {
        var value = memory.get(popByte());
        doCompare(regX, value);
        //CPX
      },

      ie5: function () {
        var addr = popByte();
        var value = memory.get(addr);
        testSBC(value);
        //SBC
      },

      ie6: function () {
        var zp = popByte();
        INC(zp);
      },

      ie8: function () {
        regX==simulator.dm ? regX=0 : regX++;  // cannot simply increment and mask in 32bit case 
        setNVflagsForRegX();
        //INX
      },

      ie9: function () {
        var value = popByte();
        testSBC(value);
        //SBC
      },

      iea: function () {
        //NOP
      },

      i42: function () {
        var value = popByte();
        console.log(String.fromCharCode(regA));
        //WDM  -- pseudo op to output a char
      },

      iec: function () {
        var value = memory.get(popWord());
        doCompare(regX, value);
        //CPX
      },

      ied: function () {
        var addr = popWord();
        var value = memory.get(addr);
        testSBC(value);
        //SBC
      },

      iee: function () {
        var addr = popWord();
        INC(addr);
      },

      if0: function () {
        var offset = popByte();
        if (zeroSet()) { jumpBranch(offset); }
        //BEQ
      },

      if1: function () {
        var zp = popByte();
        var addr = memory.getWord(zp);
        var value = memory.get(addr + regY);
        testSBC(value);
        //SBC
      },

      if5: function () {
        var addr = (popByte() + regX) & simulator.dm;
        var value = memory.get(addr);
        testSBC(value);
        //SBC
      },

      if6: function () {
        var addr = (popByte() + regX) & simulator.dm;
        INC(addr);
      },

      if8: function () {
        regP |= 8;
        //SED
      },

      if9: function () {
        var addr = popWord();
        var value = memory.get(addr + regY);
        testSBC(value);
        //SBC
      },

      ifd: function () {
        var addr = popWord();
        var value = memory.get(addr + regX);
        testSBC(value);
        //SBC
      },

      ife: function () {
        var addr = popWord() + regX;
        INC(addr);
      },

      ierr: function () {
        message("Address $" + addr2hex(regPC) + " - unknown opcode");
        codeRunning = false;
      }
    };

    function stackPush(value) {
      if (simulator.dw<32)
        memory.set((regSP & simulator.dm) + (1<<simulator.dw), value & simulator.dm);
      else
        memory.set((regSP & simulator.dm), value & simulator.dm);
      if (regSP == 0) {
        message("6502 Stack filled! Wrapping...");
        regSP = simulator.dm;
      } else {
        regSP--;
      }
    }

    function stackPop() {
      var value;
      if (regSP == simulator.dm) {
        regSP = 0;
        message("6502 Stack emptied! Wrapping...");
      } else {
        regSP++;
      }
      if (simulator.dw<32)
        value = memory.get(regSP + (1<<simulator.dw));
      else
        value = memory.get(regSP);
      return value;
    }

    // popByte() - Pops a byte
    function popByte() {
      return(memory.get(regPC++) & simulator.dm);
    }

    // popWord() - Pops a word using popByte() twice
    function popWord() {
      if (simulator.dw<32)
        return popByte() + (popByte() << simulator.dw);
      else
        return popByte();
    }

    // runBinary() - Executes the assembled code
    function runBinary() {
      if (codeRunning) {
        // Switch OFF everything
        stop();
        ui.stop();
      } else {
        ui.play();
        codeRunning = true;
        executeId = setInterval(multiExecute, 15);
      }
    }

    function multiExecute() {
      if (!debug) {
        var prevPC = regPC;
        var prevprevPC = regPC;
        // use a prime number of iterations to avoid aliasing effects
        for (var w = 0; w < 97; w++) {
          execute();
          if (!codeRunning){
            message("Program stopped, previous instruction fetched at PC=$" + addr2hex(prevprevPC));
            break
          }
          prevprevPC = prevPC;
          prevPC = regPC;
        }
      }
      updateDebugInfo();
    }


    function executeNextInstruction() {
      var instructionName = popByte().toString(16).toLowerCase();
      if (instructionName.length === 1) {
        instructionName = '0' + instructionName;
      }
      var instruction = instructions['i' + instructionName];

      if (instruction) {
        instruction();
      } else {
        instructions.ierr();
      }
    }

    // execute() - Executes one instruction.
    //             This is the main part of the CPU simulator.
    function execute(debugging) {
      if (!codeRunning && !debugging) { return; }

      setRandomByte();
      executeNextInstruction();

      if ((regPC === 0) || (!codeRunning && !debugging)) {
        stop();
        message("Program end at PC=$" + addr2hex(regPC - 1));
        ui.stop();
      }
    }

    function setRandomByte() {
      memory.set(0xfe, Math.floor(Math.random() * 256));
    }

    function updateMonitor() {
      if (monitoring) {
        var start = parseInt($node.find('.start').val(), 16);
        var length = parseInt($node.find('.length').val(), 16);
        if (start >= 0 && length > 0) {
          $node.find('.monitor code').html(memory.format(start, length));
        }
      }
    }

    // debugExec() - Execute one instruction and print values
    function debugExec() {
      //if (codeRunning) {
        execute(true);
      //}
      updateDebugInfo();
    }

    function updateDebugInfo() {
      var html = "A=$" + num2hex(regA) + " X=$" + num2hex(regX) + " Y=$" + num2hex(regY) + "<br />";
      html += "SP=$" + num2hex(regSP) + " PC=$" + addr2hex(regPC);
      html += "<br />";
      html += "NV-BDIZC<br />";
      for (var i = 7; i >=0; i--) {
        html += regP >> i & 1;
      }
      $node.find('.minidebugger').html(html);
      updateMonitor();
    }

    // gotoAddr() - Set PC to address (or address of label)
    function gotoAddr() {
      var inp = prompt("Enter address or label", "");
      var addr = 0;
      if (labels.find(inp)) {
        addr = labels.getPC(inp);
      } else {
        if (inp.match(/^0x[0-9a-f]+$/i)) {
          inp = inp.replace(/^0x/, "");
        } else if (inp.match(/^\$[0-9a-f]+$/i)) {
          inp = inp.replace(/^\$/, "");
        }
        addr = parseInt(inp, 16);
      }
      if (addr === 0 || addr < 0 || addr > simulator.ms) {
        message("Unable to find/parse given address/label");
      } else {
        regPC = addr;
      }
      updateDebugInfo();
    }


    function stopDebugger() {
      debug = false;
    }

    function enableDebugger() {
      debug = true;
      if (codeRunning) {
        updateDebugInfo();
      }
    }

    // reset() - Reset CPU and memory.
    function reset() {
      if (typeof simulator.dw === "undefined") {
         updateDw(8);  // 6502 has 8 bit databus and is the default CPU
      }

      display.reset();
      for (var i = 0; i < 0x600; i++) { // clear ZP, stack and screen
        memory.set(i, 0x00);
      }
      regA = regX = regY = 0;
      regPC = 0x600;
      regSP = 0xff;
      regP = 0x30;  // the B bit is absent, but always reads as 1
      updateDebugInfo();
    }

    function stop() {
      codeRunning = false;
      clearInterval(executeId);
    }

    function toggleMonitor() {
      monitoring = !monitoring;
    }

    return {
      runBinary: runBinary,
      enableDebugger: enableDebugger,
      stopDebugger: stopDebugger,
      debugExec: debugExec,
      gotoAddr: gotoAddr,
      reset: reset,
      stop: stop,
      dw: dw,
      aw: aw,
      dm: dm,
      am: am,
      ms: ms,
      updateDw: updateDw,
      toggleMonitor: toggleMonitor
    };
  }


  function Labels() {
    var labelIndex = [];

    function indexLines(lines) {
      for (var i = 0; i < lines.length; i++) {
        if (!indexLine(lines[i])) {
          message("**Label already defined at line " + (i + 1) + ":** " + lines[i]);
          return false;
        }
      }
      return true;
    }

    // indexLine(line) - extract label if line contains one and calculate position in memory.
    // Return false if label alread exists.
    function indexLine(input) {
      // remove comments
      input = input.replace(/^(.*?);.*/, "$1");

      // trim line
      input = input.replace(/^\s+/, "");
      input = input.replace(/\s+$/, "");

      // Figure out how many bytes this instruction takes
      var currentPC = assembler.getCurrentPC();
      assembler.assembleLine(input); //TODO: find a better way for Labels to have access to assembler

      // Find command or label
      if (input.match(/^\w+:/)) {
        var label = input.replace(/(^\w+):.*$/, "$1");
        return push(label + "|" + currentPC);
      }
      return true;
    }

    // push() - Push label to array. Return false if label already exists.
    function push(name) {
      if (find(name)) {
        return false;
      }
      labelIndex.push(name + "|");
      return true;
    }

    // find() - Returns true if label exists.
    function find(name) {
      var nameAndAddr;
      for (var i = 0; i < labelIndex.length; i++) {
        nameAndAddr = labelIndex[i].split("|");
        if (name === nameAndAddr[0]) {
          return true;
        }
      }
      return false;
    }

    // setPC() - Associates label with address
    function setPC(name, addr) {
      var nameAndAddr;
      for (var i = 0; i < labelIndex.length; i++) {
        nameAndAddr = labelIndex[i].split("|");
        if (name === nameAndAddr[0]) {
          labelIndex[i] = name + "|" + addr;
          return true;
        }
      }
      return false;
    }

    // getPC() - Get address associated with label
    function getPC(name) {
      var nameAndAddr;
      for (var i = 0; i < labelIndex.length; i++) {
        nameAndAddr = labelIndex[i].split("|");
        if (name === nameAndAddr[0]) {
          return (nameAndAddr[1]);
        }
      }
      return -1;
    }

    function displayMessage() {
      var str = "Found " + labelIndex.length + " label";
      if (labelIndex.length !== 1) {
        str += "s";
      }
      message(str + ".");
    }

    function reset() {
      labelIndex = [];
    }

    return {
      indexLines: indexLines,
      find: find,
      getPC: getPC,
      displayMessage: displayMessage,
      reset: reset
    };
  }


  function Assembler() {
    var defaultCodePC;
    var codeLen;
    var codeAssembledOK = false;

    var Opcodes = [
      /* Name, Imm,  ZP,   ZPX,  ZPY,  ABS, ABSX, ABSY,  IND, INDX, INDY, SNGL, BRA */
      ["ADC", 0x69, 0x65, 0x75, null, 0x6d, 0x7d, 0x79, null, 0x61, 0x71, null, null],
      ["AND", 0x29, 0x25, 0x35, null, 0x2d, 0x3d, 0x39, null, 0x21, 0x31, null, null],
      ["ASL", null, 0x06, 0x16, null, 0x0e, 0x1e, null, null, null, null, 0x0a, null],
      ["BIT", null, 0x24, null, null, 0x2c, null, null, null, null, null, null, null],
      ["BPL", null, null, null, null, null, null, null, null, null, null, null, 0x10],
      ["BMI", null, null, null, null, null, null, null, null, null, null, null, 0x30],
      ["BVC", null, null, null, null, null, null, null, null, null, null, null, 0x50],
      ["BVS", null, null, null, null, null, null, null, null, null, null, null, 0x70],
      ["BCC", null, null, null, null, null, null, null, null, null, null, null, 0x90],
      ["BCS", null, null, null, null, null, null, null, null, null, null, null, 0xb0],
      ["BNE", null, null, null, null, null, null, null, null, null, null, null, 0xd0],
      ["BEQ", null, null, null, null, null, null, null, null, null, null, null, 0xf0],
      ["BRK", null, null, null, null, null, null, null, null, null, null, 0x00, null],
      ["CMP", 0xc9, 0xc5, 0xd5, null, 0xcd, 0xdd, 0xd9, null, 0xc1, 0xd1, null, null],
      ["CPX", 0xe0, 0xe4, null, null, 0xec, null, null, null, null, null, null, null],
      ["CPY", 0xc0, 0xc4, null, null, 0xcc, null, null, null, null, null, null, null],
      ["DEC", null, 0xc6, 0xd6, null, 0xce, 0xde, null, null, null, null, null, null],
      ["EOR", 0x49, 0x45, 0x55, null, 0x4d, 0x5d, 0x59, null, 0x41, 0x51, null, null],
      ["CLC", null, null, null, null, null, null, null, null, null, null, 0x18, null],
      ["SEC", null, null, null, null, null, null, null, null, null, null, 0x38, null],
      ["CLI", null, null, null, null, null, null, null, null, null, null, 0x58, null],
      ["SEI", null, null, null, null, null, null, null, null, null, null, 0x78, null],
      ["CLV", null, null, null, null, null, null, null, null, null, null, 0xb8, null],
      ["CLD", null, null, null, null, null, null, null, null, null, null, 0xd8, null],
      ["SED", null, null, null, null, null, null, null, null, null, null, 0xf8, null],
      ["INC", null, 0xe6, 0xf6, null, 0xee, 0xfe, null, null, null, null, null, null],
      ["JMP", null, null, null, null, 0x4c, null, null, 0x6c, null, null, null, null],
      ["JSR", null, null, null, null, 0x20, null, null, null, null, null, null, null],
      ["LDA", 0xa9, 0xa5, 0xb5, null, 0xad, 0xbd, 0xb9, null, 0xa1, 0xb1, null, null],
      ["LDX", 0xa2, 0xa6, null, 0xb6, 0xae, null, 0xbe, null, null, null, null, null],
      ["LDY", 0xa0, 0xa4, 0xb4, null, 0xac, 0xbc, null, null, null, null, null, null],
      ["LSR", null, 0x46, 0x56, null, 0x4e, 0x5e, null, null, null, null, 0x4a, null],
      ["NOP", null, null, null, null, null, null, null, null, null, null, 0xea, null],
      ["ORA", 0x09, 0x05, 0x15, null, 0x0d, 0x1d, 0x19, null, 0x01, 0x11, null, null],
      ["TAX", null, null, null, null, null, null, null, null, null, null, 0xaa, null],
      ["TXA", null, null, null, null, null, null, null, null, null, null, 0x8a, null],
      ["DEX", null, null, null, null, null, null, null, null, null, null, 0xca, null],
      ["INX", null, null, null, null, null, null, null, null, null, null, 0xe8, null],
      ["TAY", null, null, null, null, null, null, null, null, null, null, 0xa8, null],
      ["TYA", null, null, null, null, null, null, null, null, null, null, 0x98, null],
      ["DEY", null, null, null, null, null, null, null, null, null, null, 0x88, null],
      ["INY", null, null, null, null, null, null, null, null, null, null, 0xc8, null],
      ["ROR", null, 0x66, 0x76, null, 0x6e, 0x7e, null, null, null, null, 0x6a, null],
      ["ROL", null, 0x26, 0x36, null, 0x2e, 0x3e, null, null, null, null, 0x2a, null],
      ["RTI", null, null, null, null, null, null, null, null, null, null, 0x40, null],
      ["RTS", null, null, null, null, null, null, null, null, null, null, 0x60, null],
      ["SBC", 0xe9, 0xe5, 0xf5, null, 0xed, 0xfd, 0xf9, null, 0xe1, 0xf1, null, null],
      ["STA", null, 0x85, 0x95, null, 0x8d, 0x9d, 0x99, null, 0x81, 0x91, null, null],
      ["TXS", null, null, null, null, null, null, null, null, null, null, 0x9a, null],
      ["TSX", null, null, null, null, null, null, null, null, null, null, 0xba, null],
      ["PHA", null, null, null, null, null, null, null, null, null, null, 0x48, null],
      ["PLA", null, null, null, null, null, null, null, null, null, null, 0x68, null],
      ["PHP", null, null, null, null, null, null, null, null, null, null, 0x08, null],
      ["PLP", null, null, null, null, null, null, null, null, null, null, 0x28, null],
      ["STX", null, 0x86, null, 0x96, 0x8e, null, null, null, null, null, null, null],
      ["STY", null, 0x84, 0x94, null, 0x8c, null, null, null, null, null, null, null],
      ["WDM", 0x42, 0x42, null, null, null, null, null, null, null, null, null, null],
      ["---", null, null, null, null, null, null, null, null, null, null, null, null]
    ];

    // assembleCode()
    // "assembles" the code into memory
    function assembleCode() {
      simulator.reset();
      labels.reset();
      defaultCodePC = 0x600;
      $node.find('.messages code').empty();

      var code = $node.find('.code').val();
      code += "\n\n";
      var lines = code.split("\n");
      codeAssembledOK = true;

      message("Indexing labels..");

      defaultCodePC = 0x600;

      if (!labels.indexLines(lines)) {
        return false;
      }

      labels.displayMessage();

      defaultCodePC = 0x600;
      message("Assembling code ...");

      codeLen = 0;
      for (var i = 0; i < lines.length; i++) {
        if (!assembleLine(lines[i], i)) {
          codeAssembleddOK = false;
          message("line "+i+" does not assemble: "+lines[i]);
          break;
        }
      }

      if (codeLen === 0) {
        codeAssembledOK = false;
        message("No code to run.");
      }

      if (codeAssembledOK) {
        ui.assembleSuccess();
        memory.set(defaultCodePC, 0x00); //set a null byte at the end of the code
      } else {
        var str = lines[i].replace("<", "&lt;").replace(">", "&gt;");
        message("**Syntax error line " + (i + 1) + ": " + str + "**");
        ui.initialize();
        return;
      }

      message("Code assembled successfully, " + codeLen + " bytes.");
    }

    // assembleLine()
    //
    // assembles one line of code.  Returns true if it assembled successfully,
    // false otherwise.
    function assembleLine(input, lineno) {
      var label, command, param, addr;

      // remove comments

      input = input.replace(/^(.*?);.*/, "$1");

      // trim line

      input = input.replace(/^\s+/, "");
      input = input.replace(/\s+$/, "");

      // Find command or label

      if (input.match(/^\w+:/)) {
        label = input.replace(/(^\w+):.*$/, "$1");
        if (input.match(/^\w+:[\s]*\w+.*$/)) {
          input = input.replace(/^\w+:[\s]*(.*)$/, "$1");
          command = input.replace(/^(\w+).*$/, "$1");
        } else {
          command = "";
        }
      } else {
        command = input.replace(/^(\w+).*$/, "$1");
      }

      // Blank line?  Return.

      if (command === "") {
        return true;
      }

      command = command.toUpperCase();

      if (input.match(/^\*\s*=\s*\$?[0-9a-f]+$/i)) {
        // equ spotted
        param = input.replace(/^\s*\*\s*=\s*/, "");
        if (param[0] === "$") {
          param = param.replace(/^\$/, "");
          addr = parseInt(param, 16);
        } else {
          addr = parseInt(param, 10);
        }
        if (addr < 0 || addr > simulator.ms) {
          message("Unable to relocate code outside memory");
          return false;
        }
        defaultCodePC = addr;
        return true;
      }

      if (input.match(/^\w+\s+.*?$/)) {
        param = input.replace(/^\w+\s+(.*?)/, "$1");
      } else {
        if (input.match(/^\w+$/)) {
          param = "";
        } else {
          return false;
        }
      }

      param = param.replace(/[ ]/g, "");

      if (command === "DCB") {
        return DCB(param);
      }


      for (var o = 0; o < Opcodes.length; o++) {
        if (Opcodes[o][0] === command) {
          if (checkSingle(param, Opcodes[o][11])) { return true; }
          if (checkImmediate(param, Opcodes[o][1])) { return true; }
          if (checkZeroPage(param, Opcodes[o][2])) { return true; }
          if (checkZeroPageX(param, Opcodes[o][3])) { return true; }
          if (checkZeroPageY(param, Opcodes[o][4])) { return true; }
          if (checkAbsoluteX(param, Opcodes[o][6])) { return true; }
          if (checkAbsoluteY(param, Opcodes[o][7])) { return true; }
          if (checkIndirect(param, Opcodes[o][8])) { return true; }
          if (checkIndirectX(param, Opcodes[o][9])) { return true; }
          if (checkIndirectY(param, Opcodes[o][10])) { return true; }
          if (checkAbsolute(param, Opcodes[o][5])) { return true; }
          if (checkBranch(param, Opcodes[o][12])) { return true; }
        }
      }
      return false; // Unknown opcode
    }

    function DCB(param) {
      var values, number, str, ch;
      values = param.split(",");
      if (values.length === 0) { return false; }
      for (var v = 0; v < values.length; v++) {
        str = values[v];
        if (str) {
          ch = str.substring(0, 1);
          if (ch === "$") {
            number = parseInt(str.replace(/^\$/, ""), 16);
            pushByte(number);
          } else if (ch >= "0" && ch <= "9") {
            number = parseInt(str, 10);
            pushByte(number);
          } else {
            return false;
          }
        }
      }
      return true;
    }

    // checkBranch() - Commom branch function for all branches (BCC, BCS, BEQ, BNE..)
    function checkBranch(param, opcode) {
      var addr;
      if (opcode === null) { return false; }

      addr = -1;
      if (param.match(/\w+/)) {
        addr = labels.getPC(param);
      }
      if (addr === -1) { pushWord(0x00); return false; }
      pushByte(opcode);
      if (addr < (defaultCodePC - 0x600)) {  // Backwards?
        pushByte((simulator.dm - ((defaultCodePC - 0x600) - addr)) & simulator.dm);
        return true;
      }
      pushByte((addr - (defaultCodePC - 0x600) - 1) & simulator.dm);
      return true;
    }

    // checkImmediate() - Check if param is immediate and push value
    function checkImmediate(param, opcode) {
      var value, label, hilo, addr;
      if (opcode === null) { return false; }
      if (param.match(/^#\$[0-9a-f]+$/i)) {
        pushByte(opcode);
        value = parseInt(param.replace(/^#\$/, ""), 16);
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(value);
        return true;
      }
      if (param.match(/^#[0-9]+$/i)) {
        pushByte(opcode);
        value = parseInt(param.replace(/^#/, ""), 10);
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(value);
        return true;
      }
      // Label lo/hi
      if (param.match(/^#[<>]\w+$/)) {
        label = param.replace(/^#[<>](\w+)$/, "$1");
        hilo = param.replace(/^#([<>]).*$/, "$1");
        pushByte(opcode);
        if (labels.find(label)) {
          addr = labels.getPC(label);
          switch(hilo) {
          case ">":
            pushByte((addr >> simulator.dw) & simulator.dm);
            return true;
          case "<":
            pushByte(addr & simulator.dm);
            return true;
          default:
            return false;
          }
        } else {
          pushByte(0x00);
          return true;
        }
      }
      return false;
    }

    // checkIndirect() - Check if param is indirect and push value
    function checkIndirect(param, opcode) {
      var value;
      if (opcode === null) { return false; }
      if (param.match(/^\(\$[0-9a-f]+\)$/i)) {
        pushByte(opcode);
        value = param.replace(/^\(\$([0-9a-f]+).*$/i, "$1");
        if (value < 0 || value > simulator.am) { return false; }
        pushWord(parseInt(value, 16));
        return true;
      }
      return false;
    }

    // checkIndirectX() - Check if param is indirect X and push value
    function checkIndirectX(param, opcode) {
      var value;
      if (opcode === null) { return false; }
      if (param.match(/^\(\$[0-9a-f]+,X\)$/i)) {
        pushByte(opcode);
        value = param.replace(/^\(\$([0-9a-f]+).*$/i, "$1");
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(parseInt(value, 16));
        return true;
      }
      return false;
    }

    // checkIndirectY() - Check if param is indirect Y and push value
    function checkIndirectY(param, opcode) {
      var value;
      if (opcode === null) { return false; }
      if (param.match(/^\(\$[0-9a-f]+\),Y$/i)) {
        pushByte(opcode);
        value = param.replace(/^\([\$]([0-9a-f]+).*$/i, "$1");
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(parseInt(value, 16));
        return true;
      }
      return false;
    }

    // checkSingle() - Single-byte opcodes
    function checkSingle(param, opcode) {
      if (opcode === null) { return false; }
      // Accumulator instructions are counted as single-byte opcodes
      if (param !== "" && param !== "A") { return false; }
      pushByte(opcode);
      return true;
    }

    // checkZeroPage() - Check if param is ZP and push value
    function checkZeroPage(param, opcode) {
      var value;
      if (opcode === null) { return false; }
      if (param.match(/^\$[0-9a-f]+$/i)) {
        pushByte(opcode);
        value = parseInt(param.replace(/^\$/, ""), 16);
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(value);
        return true;
      }
      if (param.match(/^[0-9]+$/i)) {
        value = parseInt(param, 10);
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(opcode);
        pushByte(value);
        return true;
      }
      return false;
    }

    // checkAbsoluteX() - Check if param is ABSX and push value
    function checkAbsoluteX(param, opcode) {
      var number, value, addr;
      if (opcode === null) { return false; }
      if (param.match(/^\$[0-9a-f]+,X$/i)) {
        pushByte(opcode);
        number = param.replace(/^\$([0-9a-f]*),X/i, "$1");
        value = parseInt(number, 16);
        if (value < 0 || value > simulator.am) { return false; }
        pushWord(value);
        return true;
      }

      if (param.match(/^\w+,X$/i)) {
        param = param.replace(/,X$/i, "");
        pushByte(opcode);
        if (labels.find(param)) {
          addr = labels.getPC(param);
          if (addr < 0 || addr > simulator.am) { return false; }
          pushWord(addr);
          return true;
        } else {
          pushWord(0x1234);
          return true;
        }
      }

      return false;
    }

    // checkAbsoluteY() - Check if param is ABSY and push value
    function checkAbsoluteY(param, opcode) {
      var number, value, addr;
      if (opcode === null) { return false; }
      if (param.match(/^\$[0-9a-f]+,Y$/i)) {
        pushByte(opcode);
        number = param.replace(/^\$([0-9a-f]*),Y/i, "$1");
        value = parseInt(number, 16);
        if (value < 0 || value > simulator.am) { return false; }
        pushWord(value);
        return true;
      }

      // it could be a label too..

      if (param.match(/^\w+,Y$/i)) {
        param = param.replace(/,Y$/i, "");
        pushByte(opcode);
        if (labels.find(param)) {
          addr = labels.getPC(param);
          if (addr < 0 || addr > simulator.am) { return false; }
          pushWord(addr);
          return true;
        } else {
          pushWord(0x1234);
          return true;
        }
      }
      return false;
    }

    // checkZeroPageX() - Check if param is ZPX and push value
    function checkZeroPageX(param, opcode) {
      var number, value;
      if (opcode === null) { return false; }
      if (param.match(/^\$[0-9a-f]+,X/i)) {
        pushByte(opcode);
        number = param.replace(/^\$([0-9a-f]+),X/i, "$1");
        value = parseInt(number, 16);
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(value);
        return true;
      }
      if (param.match(/^[0-9]+,X/i)) {
        pushByte(opcode);
        number = param.replace(/^([0-9]{1,3}),X/i, "$1");
        value = parseInt(number, 10);
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(value);
        return true;
      }
      return false;
    }

    function checkZeroPageY(param, opcode) {
      var number, value;
      if (opcode === null) { return false; }
      if (param.match(/^\$[0-9a-f]+,Y/i)) {
        pushByte(opcode);
        number = param.replace(/^\$([0-9a-f]+),Y/i, "$1");
        value = parseInt(number, 16);
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(value);
        return true;
      }
      if (param.match(/^[0-9]+,Y/i)) {
        pushByte(opcode);
        number = param.replace(/^([0-9]+),Y/i, "$1");
        value = parseInt(number, 10);
        if (value < 0 || value > simulator.dm) { return false; }
        pushByte(value);
        return true;
      }
      return false;
    }

    // checkAbsolute() - Check if param is ABS and push value
    function checkAbsolute(param, opcode) {
      var value, number, addr;
      if (opcode === null) { return false; }
      pushByte(opcode);
      if (param.match(/^\$[0-9a-f]+$/i)) {
        value = parseInt(param.replace(/^\$/, ""), 16);
        if (value < 0 || value > simulator.am) { return false; }
        pushWord(value);
        return true;
      }
      if (param.match(/^[0-9]+$/i)) {
        value = parseInt(param, 10);
        if (value < 0 || value > simulator.am) { return false; }
        pushWord(value);
        return(true);
      }
      // it could be a label too..
      if (param.match(/^\w+$/)) {
        if (labels.find(param)) {
          addr = (labels.getPC(param));
          if (addr < 0 || addr > simulator.am) { return false; }
          pushWord(addr);
          return true;
        } else {
          pushWord(0x1234);
          return true;
        }
      }
      return false;
    }

    // pushByte() - Push byte to memory
    function pushByte(value) {
      memory.set(defaultCodePC, value & simulator.dm);
      defaultCodePC++;
      codeLen++;
    }

    // pushWord() - Push a word using pushByte twice
    function pushWord(value) {
      pushByte(value & simulator.dm);
      pushByte((value / (simulator.dm+1)) & simulator.dm);
    }

    function openPopup(content, title) {
      var w = window.open('', title, 'width=500,height=300,resizable=yes,scrollbars=yes,toolbar=no,location=no,menubar=no,status=no');

      var html = "<html><head>";
      html += "<link href='style.css' rel='stylesheet' type='text/css' />";
      html += "<title>" + title + "</title></head><body>";
      html += "<pre><code>";

      html += content;

      html += "</code></pre></body></html>";
      w.document.write(html);
      w.document.close();
    }

    // hexDump() - Dump binary as hex to new window
    function hexdump() {
      openPopup(memory.format(0x600, codeLen), 'Hexdump');
    }

    // TODO: Create separate disassembler object?
    var addressingModes = [
      null,
      'Imm',
      'ZP',
      'ZPX',
      'ZPY',
      'ABS',
      'ABSX',
      'ABSY',
      'IND',
      'INDX',
      'INDY',
      'SNGL',
      'BRA'
    ];

    var instructionLength = {
      Imm: 2,
      ZP: 2,
      ZPX: 2,
      ZPY: 2,
      ABS: 3,
      ABSX: 3,
      ABSY: 3,
      IND: 3,
      INDX: 2,
      INDY: 2,
      SNGL: 1,
      BRA: 2
    };

    function getModeAndCode(byte) {
      var index;
      var line = Opcodes.filter(function (line) {
        var possibleIndex = line.indexOf(byte);
        if (possibleIndex > -1) {
          index = possibleIndex;
          return true;
        }
      })[0];

      if (!line) { //instruction not found
        return {
          opCode: '???',
          mode: 'SNGL'
        };
      } else {
        return {
          opCode: line[0],
          mode: addressingModes[index]
        };
      }
    }

    function createInstruction(address) {
      var bytes = [];
      var opCode;
      var args = [];
      var mode;

      function isAccumulatorInstruction() {
        var accumulatorBytes = [0x0a, 0x4a, 0x2a, 0x6a];
        if (accumulatorBytes.indexOf(bytes[0]) > -1) {
          return true;
        }
      }

      function isBranchInstruction() {
        return opCode.match(/^B/) && !(opCode == 'BIT' || opCode == 'BRK');
      }

      //This is gnarly, but unavoidably so?
      function formatArguments() {
        var argsString = args.map(num2hex).reverse().join('');

        if (isBranchInstruction()) {
          var destination = address + 2;
          if (args[0] > 0x7f) {
            destination -= 0x100 - args[0];
          } else {
            destination += args[0];
          }
          argsString = addr2hex(destination);
        }

        if (argsString) {
          argsString = '$' + argsString;
        }
        if (mode == 'Imm') {
          argsString = '#' + argsString;
        }
        if (mode.match(/X$/)) {
          argsString += ',X';
        }
        if (mode.match(/^IND/)) {
          argsString = '(' + argsString + ')';
        }
        if (mode.match(/Y$/)) {
          argsString += ',Y';
        }

        if (isAccumulatorInstruction()) {
          argsString = 'A';
        }

        return argsString;
      }

      return {
        addByte: function (byte) {
          bytes.push(byte);
        },
        setModeAndCode: function (modeAndCode) {
          opCode = modeAndCode.opCode;
          mode = modeAndCode.mode;
        },
        addArg: function (arg) {
          args.push(arg);
        },
        toString: function () {
          var bytesString = bytes.map(num2hex).join(' ');
          var padding = Array(2+3*(1+simulator.dw/4) - bytesString.length).join(' ');
          return '$' + addr2hex(address) + '    ' + bytesString + padding + opCode +
            ' ' + formatArguments(args);
        }
      };
    }

    function disassemble() {
      var startAddress = 0x600;
      var currentAddress = startAddress;
      var endAddress = startAddress + codeLen;
      var instructions = [];
      var length;
      var inst;
      var byte;
      var modeAndCode;

      while (currentAddress < endAddress - 1) {
        inst = createInstruction(currentAddress);
        byte = memory.get(currentAddress);
        inst.addByte(byte);

        modeAndCode = getModeAndCode(byte);
        length = instructionLength[modeAndCode.mode];
        inst.setModeAndCode(modeAndCode);

        for (var i = 1; i < length; i++) {
          currentAddress++;
          byte = memory.get(currentAddress);
          inst.addByte(byte);
          inst.addArg(byte);
        }
        instructions.push(inst);
        currentAddress++;
      }

      var html = 'Address' + Array(simulator.aw/4-1).join(' ');
      html += 'Hexdump' + Array(3*simulator.dw/4-2).join(' ') + 'Dissassembly\n';
      html += Array(simulator.aw/4 + 2 + 3*simulator.dw/4 + 20).join('-')+'\n';
      html += instructions.join('\n');
      openPopup(html, 'Disassembly');
    }

    return {
      assembleLine: assembleLine,
      assembleCode: assembleCode,
      getCurrentPC: function () {
        return defaultCodePC;
      },
      hexdump: hexdump,
      disassemble: disassemble
    };
  }


  function addr2hex(nr) {
    return num2hexwidth(nr, simulator.aw);
  }

  function num2hex(nr) {
    return num2hexwidth(nr, simulator.dw);
  }

  function num2hexwidth(nr,w) {
    var val = "";
    for (i=0; i<w/4; i++){
       val = (nr & 0xf).toString(16) + val;
       nr = nr >> 4;
    }
    return val;
  }

  // message() - Prints text in the message window
  function message(text) {
    $node.find('.messages code').append(text + '\n').scrollTop(10000);
  }


  initialize();
}

$(document).ready(function () {
  $('.widget').each(function () {
    SimulatorWidget(this);
  });
});
