import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { watchSession, notifyAccountBlocked } from './sessionEvents.js';

test('blocking immediately notifies every open tab of that user only', () => {
    const response=()=>Object.assign(new EventEmitter(),{messages:[],ended:false,write(text){this.messages.push(text);},end(){this.ended=true;this.emit('close');}});
    const first=response(),second=response(),other=response();
    watchSession(123,first);watchSession(123,second);watchSession(124,other);
    notifyAccountBlocked(123);
    assert.equal(first.ended,true);assert.equal(second.ended,true);assert.equal(other.ended,false);
    assert.match(first.messages[0],/event: blocked/);
    other.end();
});
