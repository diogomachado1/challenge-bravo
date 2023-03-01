import { inject, injectable } from "inversify";
import { type Currency } from "../Entities/Currency.interface";
import NotFoundError from "../Infra/Errors/NotFoundError";
import { ICurrencyRepository } from "../Infra/Repository/types/CurrencyRepo.interface";
import { IExternalSourceType } from "../Infra/Repository/types/ExternalSourceType.interface";
import { type ICurrencyService } from "./types/CurrencyService.interface";

@injectable()
export class CurrencyService implements ICurrencyService {
    private readonly sourceTypes: Record<string, IExternalSourceType>;
    constructor(
        @inject("CurrencyRepository")
        private readonly currencyRepository: ICurrencyRepository,
        @inject("CoingateRepository")
        private readonly coingateRepository: IExternalSourceType
    ) {
        this.sourceTypes = {
            coingate: this.coingateRepository,
        };
    }

    async getConversion(
        originCurrencyId: string,
        outCurrencyId: string,
        amount: number
    ): Promise<{ total: number }> {
        const [originCurrencyDollarValue, outCurrencyDollarValue] =
            await Promise.all([
                this.getDollarRate(originCurrencyId),
                this.getDollarRate(outCurrencyId),
            ]);

        const amountInDollar = originCurrencyDollarValue * amount;
        return {
            total: amountInDollar / outCurrencyDollarValue,
        };
    }

    async getDollarRate(currencyId: string) {
        const currencyData = await this.currencyRepository.getCurrency(
            currencyId
        );
        if (currencyData == null) throw new NotFoundError("currency");
        const dollarRate = await this.getDollarRateBySourceType(currencyData);
        if (dollarRate == null) throw new NotFoundError("dollar rate");
        return dollarRate;
    }

    async getDollarRateBySourceType(currencyData: Currency) {
        if (currencyData.sourceType === "fixed") return currencyData.dollarRate;
        const dollarRateInCache = await this.currencyRepository.getDollarRate(
            currencyData.id
        );
        if (dollarRateInCache != null) return dollarRateInCache;
        const externalDollarRate = await this.sourceTypes[
            currencyData.sourceType
        ]?.getExternalDollarValue(currencyData.id);
        if (externalDollarRate != null) {
            await this.currencyRepository.setDollarRate(
                currencyData.id,
                externalDollarRate
            );
            return externalDollarRate;
        }
        return null;
    }

    async getAllCurrenciesDollarRateCache() {
        const allCurrency = await this.currencyRepository.getAllCurrencies();
        await Promise.all(
            allCurrency.map(
                async (item) => await this.getDollarRateBySourceType(item)
            )
        );
    }
}
