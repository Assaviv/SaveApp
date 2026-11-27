import { Component, forwardRef, inject, Input } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Card } from '@save-app/models';
import { CollectionsFacade } from '@save-app/data-access';
import { CardActions } from '../card-actions';
import { CommonModule } from '@angular/common';
import { CardComponent } from '../card/card-component';
import { CARD_DROP_HOVER_CLASS, CARD_DROP_TARGET_ATTR, collapse, dropTargetAt, leanToward, suckInto } from './vacuum-drop';


@Component({
  selector: 'save-app-cards-view',
  standalone: true,
  imports: [CommonModule, DragDropModule, CardComponent],
  templateUrl: './cards-view.component.html',
  styleUrl: './cards-view.component.scss',
  providers: [{ provide: CardActions, useExisting: forwardRef(() => CardsViewComponent) }],
})
export class CardsViewComponent implements CardActions {
  @Input() collectionId: string | null = null;
  @Input() cards: Card[] = [];
  @Input() enableDragDrop = true;

  private readonly facade = inject(CollectionsFacade);
  /** The collection tile under the pointer while dragging. Only the pointer decides the target. */
  private dropTarget: HTMLElement | null = null;

  update(card: Card): void {
    if (this.collectionId) void this.facade.updateCard(this.collectionId, card);
  }

  remove(cardId: string): void {
    if (this.collectionId) void this.facade.deleteCard(this.collectionId, cardId);
  }

  /** Highlights the collection tile under the pointer (any element with data-card-drop-target) and leans the card at it. */
  trackDropTarget({ x, y }: { x: number; y: number }): void {
    const tile = dropTargetAt(x, y);
    const target = tile && tile.getAttribute(CARD_DROP_TARGET_ATTR) !== this.collectionId ? tile : null;
    if (target === this.dropTarget) return;
    this.dropTarget?.classList.remove(CARD_DROP_HOVER_CLASS);
    target?.classList.add(CARD_DROP_HOVER_CLASS);
    leanToward(target, x);
    this.dropTarget = target;
  }

  /** Runs before CDK animates the preview back: over a tile, the vacuum effect replaces that animation. */
  releaseCard(): void {
    const preview = document.querySelector<HTMLElement>('.cdk-drag-preview');
    if (!this.dropTarget) return;
    if (!preview) {
      this.dropTarget.classList.remove(CARD_DROP_HOVER_CLASS);
      return;
    }
    suckInto(preview, this.dropTarget); // closes the target's lid when the card is in
    preview.classList.add('vacuum-hidden'); // no transition, so CDK removes it at once
  }

  /** Released over a tile → move the card there; otherwise it's a reorder within this list. */
  dropCard(event: CdkDragDrop<Card[], Card[], Card>): void {
    const target = this.dropTarget;
    this.dropTarget = null;
    if (!this.collectionId) return;
    const toId = target?.getAttribute(CARD_DROP_TARGET_ATTR);
    if (toId) {
      const leaving = collapse(event.item.element.nativeElement);
      this.facade
        .moveCard(this.collectionId, toId, event.item.data.id)
        .catch((err) => {
          leaving.cancel(); // show the card again
          console.error('[move] could not move card', err);
        });
      return;
    }
    if (event.previousIndex === event.currentIndex) return;
    void this.facade.reorderCards(
      this.collectionId, this.cards, event.previousIndex, event.currentIndex,
    );
  }

  trackByCardId(_: number, card: Card): string {
    return card.id;
  }
}