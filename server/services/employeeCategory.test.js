import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryFromLinks } from './employeeCategory.js';
import { fieldsForCategory } from '../../shared/calculationSettings.js';
import { uniqueServices, serviceKey } from '../../shared/services.js';

test('category comes from linked specialization; conflicting branches do not silently choose a rate', () => {
    assert.equal(categoryFromLinks([{position:'Барбер',specialization:'Барбер эксперт'}]),'expert');
    assert.equal(categoryFromLinks([{specialization:'ТОП БАРБЕР'}]),'top');
    assert.equal(categoryFromLinks([{position:'Администратор',specialization:'Старший администратор'}]),'admin');
    assert.equal(categoryFromLinks([{specialization:'Барбер'},{specialization:'Барбер'}]),'barber');
    assert.equal(categoryFromLinks([{specialization:'Барбер'},{specialization:'ТОП БАРБЕР'}]),null);
    assert.equal(categoryFromLinks([]),null);
    assert.equal(categoryFromLinks([{position:null,specialization:null}]),null);
    assert.equal(categoryFromLinks([{specialization:'Не указана'}]),null);
});
test('YCLIENTS category matching is independent of text case', () => {
    for (const [text, expected] of [['Администратор','admin'],['Топ барбер','top'],['Барбер эксперт','expert'],['Барбер','barber']]) {
        for (const value of [text.toLowerCase(),text.toUpperCase(),text]) {
            assert.equal(categoryFromLinks([{specialization:`  ${value}  `}]),expected);
            assert.equal(categoryFromLinks([{position:value}]),expected);
        }
    }
});
test('barber and admin fields reflect their work and both include cosmetics', () => {
    assert.deepEqual(fieldsForCategory('top').map(([key])=>key),['rate','servicePercent','productPercent']);
    assert.deepEqual(fieldsForCategory('admin').map(([key])=>key),['rate','productPercent','cleaningRate','seniorBonus','contentBonus']);
    assert.deepEqual(fieldsForCategory(null).map(([key])=>key),['rate','productPercent']);
});
test('same service across branches has one normalized option without merging distinct names', () => {
    const services=uniqueServices([{id:1,title:' Мужская  стрижка '},{id:2,title:'мужская стрижка'}, {id:3,title:'Мужская стрижка + борода'}]);
    assert.equal(services.length,2);
    assert.equal(services[0].id,serviceKey('МУЖСКАЯ СТРИЖКА'));
});

test('service aliases used for menu and employee quantities share exactly the same groups', () => {
    const variants=['Ваксинг','Ваксинг (1 зона)','Ваксинг(удаление волос воском)'];
    assert.equal(uniqueServices(variants.map(title=>({title}))).length,1);
    assert.ok(variants.every(title=>serviceKey(title)===serviceKey('Ваксинг')));
    assert.equal(serviceKey('Мужская удлиненнаястрижка'),serviceKey('Мужская удлинённая стрижка'));
    for(const price of ['800Р','за 1000P','за 1200Р.']) {
        assert.equal(serviceKey(`Счастливые часы: мужская стрижка ${price}`),serviceKey('Мужская стрижка'));
    }
    assert.notEqual(serviceKey('Комплекс ваксинг (3 зоны)'),serviceKey('Ваксинг'));
    assert.notEqual(serviceKey('Оформление бороды с распариванием'),serviceKey('Оформление бороды'));
    const counts={};
    for(const title of variants) {const key=serviceKey(title);counts[key]=(counts[key]||0)+1;}
    assert.equal(counts[uniqueServices(variants.map(title=>({title})))[0].id],3);
});
