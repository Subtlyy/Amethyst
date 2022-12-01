import { Store } from "@/state";
import PromisePool from "@supercharge/promise-pool";
import { useLocalStorage } from "@vueuse/core";
import { ref } from "vue";
import { bytesToHuman, secondsToHuman } from "@shared/formating";
import { fisherYatesShuffle } from "./math";
import { Track } from "./track";

export class Queue {
  private savedQueue = useLocalStorage<string[]>("queuev2", []);
  private list = ref(new Map<string, Track>());

  public totalSize = ref(0);
  public totalDuration = ref(0);

  public constructor(paths?: string[]) {
    paths 
      ? this.add(paths)
      : this.add(this.savedQueue.value);
  }

  public getList() {
    return Array.from(this.list.value.values());
  }

  // public sort(by: keyof ICommonTagsResult) {
  //   return this.getList().sort((a, b) => a.metadata.data?.common[by] > b.metadata.data?.common[by] ? 1 : -1);
  // }

  public search(search: string) {
    return this.getList()
        .filter(track => search ? !track.hasErrored : track)
        .filter(track => 
          track.getFilename().toLowerCase().includes(search)
          || track.getArtistsFormatted()?.toLowerCase().includes(search)
          || track.getTitle()?.toLowerCase().includes(search)
          || track.getAlbumFormatted()?.toLowerCase().includes(search));
  }

  public updateTotalSize() {
    this.totalSize.value = this.getList().reduce((a, b) => a + (b.metadata.data?.size || 0), 0);
  }

  public updateTotalDuration(){
    this.totalDuration.value = this.getList().reduce((a, b) => a + (b.getDurationSeconds()), 0);
  }

  public getTotalSizeFormatted(){
    return bytesToHuman(this.totalSize.value);
  }

  public getTotalTracks(){
    return this.getList().length;
  }

  public getTotalDurationFormatted() {
    return secondsToHuman(this.totalDuration.value);
  }

  /**
   * Saves the current queue to local storage for persistance
   */
  private syncLocalStorage() {
    this.savedQueue.value = this.getList().map(t => t.path);
  }

  /**
   * Fetches all async data for each track concurrently
   */
  public async fetchAsyncData(force?: boolean){
    return PromisePool
			.for(force ? this.getList() : this.getList().filter(track => !track.isLoaded))
			.withConcurrency(new Store().settings.processingConcurrency || 3)
			.process(async track => {
        await track.fetchAsyncData(force);
        this.updateTotalSize();
        this.updateTotalDuration();
      });
  }

  public getTrack(idx: number){
    return this.getList()[idx];
  }

  /**
   * Adds a track to the queue
   * @param path A filepath to the track
   */
  public async add(path: string | string[]) {
    if (path instanceof Array) {
      path.forEach(path => this.list.value.set(path, new Track(path)));
      await this.fetchAsyncData();
    } else {
      const track = new Track(path);
      this.list.value.set(path, track);
      await track.fetchAsyncData();
    }

    this.syncLocalStorage();
  }

  /**
   * Removes a track from the queue
   * @param target An index or Track instance to remove
   */
  public remove(target: number| Track) {
    target instanceof Track ? this.list.value.delete(target.path) : this.list.value.delete(this.getTrack(target).path);
    this.syncLocalStorage();
  }

  public clear(){
    this.list.value.clear();
    this.syncLocalStorage();
  }

  public clearErrored(){
    this.getList().filter(t => t.hasErrored).forEach(t => this.remove(t));
    this.syncLocalStorage();
  }

  /**
   * Shuffles the queue
   */
  public shuffle() {
		this.list.value = new Map(fisherYatesShuffle(Array.from(this.list.value.entries())));
    this.syncLocalStorage();
  }
} 