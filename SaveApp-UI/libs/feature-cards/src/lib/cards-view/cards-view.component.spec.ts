import { TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { Card, CardType } from '@save-app/models';
import { CollectionsFacade } from '@save-app/data-access';
import { CardsViewComponent } from './cards-view.component';

describe('CardsViewComponent', () => {
  let component: CardsViewComponent;
  let facade: { updateCard: jest.Mock; deleteCard: jest.Mock; reorderCards: jest.Mock; moveCard: jest.Mock };
  const cards: Card[] = [
    { id: 'a', key: 'A', cardType: CardType.SUBJECT },
    { id: 'b', key: 'B', cardType: CardType.SUBJECT },
  ];

  beforeEach(() => {
    facade = { updateCard: jest.fn(), deleteCard: jest.fn(), reorderCards: jest.fn(), moveCard: jest.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({ imports: [CardsViewComponent], providers: [
      { provide: CollectionsFacade, useValue: facade },
    ] });
    component = TestBed.createComponent(CardsViewComponent).componentInstance;
    component.collectionId = 'collection-1';
    component.cards = cards;
  });

  it('forwards updates and removals for its collection', () => {
    component.update(cards[0]);
    component.remove(cards[1].id);
    expect(facade.updateCard).toHaveBeenCalledWith('collection-1', cards[0]);
    expect(facade.deleteCard).toHaveBeenCalledWith('collection-1', 'b');
  });

  it('skips actions without a collection and skips a no-op drop', () => {
    component.collectionId = null;
    component.update(cards[0]);
    component.remove('a');
    component.dropCard({ previousIndex: 0, currentIndex: 1 } as CdkDragDrop<Card[]>);
    component.collectionId = 'collection-1';
    component.dropCard({ previousIndex: 1, currentIndex: 1 } as CdkDragDrop<Card[]>);
    expect(facade.updateCard).not.toHaveBeenCalled();
    expect(facade.deleteCard).not.toHaveBeenCalled();
    expect(facade.reorderCards).not.toHaveBeenCalled();
  });

  it('delegates a reordered drop and tracks cards by id', () => {
    component.dropCard({ previousIndex: 0, currentIndex: 1 } as CdkDragDrop<Card[]>);
    expect(facade.reorderCards).toHaveBeenCalledWith('collection-1', cards, 0, 1);
    expect(component.trackByCardId(0, cards[1])).toBe('b');
  });

  describe('dragging onto a collection tile', () => {
    let tile: HTMLElement;
    let item: HTMLElement;
    const elementFromPoint = document.elementFromPoint;
    const drop = (previousIndex = 0, currentIndex = 0) =>
      component.dropCard({ previousIndex, currentIndex, item: { element: { nativeElement: item }, data: cards[0] } } as
        unknown as CdkDragDrop<Card[], Card[], Card>);

    beforeEach(() => {
      tile = document.createElement('div');
      tile.setAttribute('data-card-drop-target', 'collection-2');
      tile.appendChild(document.createElement('span'));
      document.body.appendChild(tile);
      item = document.createElement('div');
      item.animate = jest.fn(() => ({ cancel: jest.fn() }) as unknown as Animation);
      document.elementFromPoint = jest.fn((x: number) => (x === 1 ? tile.firstElementChild : document.body));
    });
    afterEach(() => {
      tile.remove();
      document.elementFromPoint = elementFromPoint;
    });

    it('moves the card to the tile it is released over', () => {
      component.trackDropTarget({ x: 1, y: 1 });
      expect(tile.classList).toContain('card-drop-hover');
      drop();
      expect(facade.moveCard).toHaveBeenCalledWith('collection-1', 'collection-2', 'a');
      expect(facade.reorderCards).not.toHaveBeenCalled();
    });

    it('does not move a card that left the tile before release', () => {
      component.trackDropTarget({ x: 1, y: 1 });
      component.trackDropTarget({ x: 2, y: 2 });
      expect(tile.classList).not.toContain('card-drop-hover');
      drop(0, 1);
      expect(facade.moveCard).not.toHaveBeenCalled();
      expect(facade.reorderCards).toHaveBeenCalledWith('collection-1', cards, 0, 1);
    });

    it('leans the drag preview toward the hovered tile and back', () => {
      const preview = document.createElement('div');
      preview.className = 'cdk-drag-preview';
      document.body.appendChild(preview);
      component.trackDropTarget({ x: 1, y: 1 });
      expect(preview.classList).toContain('lean-toward-target');
      component.trackDropTarget({ x: 2, y: 2 });
      expect(preview.classList).not.toContain('lean-toward-target');
      preview.remove();
    });

    it('ignores the tile of the open collection', () => {
      tile.setAttribute('data-card-drop-target', 'collection-1');
      component.trackDropTarget({ x: 1, y: 1 });
      drop();
      expect(facade.moveCard).not.toHaveBeenCalled();
    });
  });
});
